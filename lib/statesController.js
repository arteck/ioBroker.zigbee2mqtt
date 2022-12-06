const utils = require('./utils');
const incStatsQueue = [];
const timeOutCache = {};

class StatesController {
    constructor(adapter, deviceCache, groupCache, logCustomizations, createCache) {
        this.adapter = adapter;
        this.groupCache = groupCache;
        this.deviceCache = deviceCache;
        this.logCustomizations = logCustomizations;
        this.createCache = createCache;
    }

    processDeviceMessage(messageObj) {
        // Is payload present?
        if (messageObj.payload == '') {
            return;
        }

        const device = this.groupCache.concat(this.deviceCache).find(x => x.id == messageObj.topic);
        if (device) {
            try {
                this.setDeviceStateSafely(messageObj, device);
            } catch (error) {
                this.adapter.log.error(error);
            }
        } else {
            incStatsQueue[incStatsQueue.length] = messageObj;
            this.adapter.log.debug(`Device: ${messageObj.topic} not found, queue state in incStatsQueue!`);
        }
    }

    async setDeviceStateSafely(messageObj, device) {
        if (this.logCustomizations.debugDevices.includes(device.ieee_address)) {
            this.adapter.log.warn(`--->>> fromZ2M -> ${device.ieee_address} states: ${JSON.stringify(messageObj)}`);
        }

        //  Is an action
        if (Object.keys(messageObj.payload).includes('action')) {
            const states = device.states.filter(x => (x.prop && x.prop == 'action'));

            for (const state of states) {
                const stateName = `${device.ieee_address}.${state.id}`;

                // It may be that the state has not yet been created!
                if (!this.createCache[device.ieee_address] || !this.createCache[device.ieee_address][state.id] || !this.createCache[device.ieee_address][state.id].created) {
                    incStatsQueue[incStatsQueue.length] = messageObj;
                    continue;
                }

                if (!state.getter) {
                    this.adapter.log.error(`Action ${stateName} has no getter, this must not be!`);
                    continue;
                }

                try {
                    if (state.isEvent && state.isEvent == true) {
                        if (state.type == 'boolean') {
                            await this.setStateWithTimeoutAsync(stateName, state.getter(messageObj.payload), 300);
                        }
                        else {
                            await this.setStateSafelyAsync(stateName, state.getter(messageObj.payload));
                        }
                    }
                    else {
                        await this.setStateChangedSafelyAsync(stateName, state.getter(messageObj.payload));
                    }
                } catch (err) {
                    incStatsQueue[incStatsQueue.length] = messageObj;
                    this.adapter.log.debug(`Can not set ${stateName}, queue state in incStatsQueue!`);
                }
            }
        }
        // Is not an action
        else {
            for (const [key, value] of Object.entries(messageObj.payload)) {
                let state = device.states.find(x => x.prop && x.prop == key);

                if (!state) {
                    state = device.states.find(x => x.id == key);
                }

                if (!state) {
                    continue;
                }

                const stateName = `${device.ieee_address}.${state.id}`;

                // It may be that the state has not yet been created!
                if (!this.createCache[device.ieee_address] || !this.createCache[device.ieee_address][state.id] || !this.createCache[device.ieee_address][state.id].created) {
                    incStatsQueue[incStatsQueue.length] = messageObj;
                    continue;
                }

                try {
                    if (state.getter) {
                        await this.setStateChangedSafelyAsync(stateName, state.getter(messageObj.payload));
                    } else {
                        await this.setStateChangedSafelyAsync(stateName, value);
                    }
                } catch (err) {
                    incStatsQueue[incStatsQueue.length] = messageObj;
                    this.adapter.log.debug(`Can not set ${stateName}, queue state in incStatsQueue!`);
                }

            }
        }
    }

    async setStateSafelyAsync(stateName, value) {
        if (value !== undefined) {
            await this.adapter.setStateAsync(stateName, value, true);
        }
    }

    async setStateChangedSafelyAsync(stateName, value) {
        if (value !== undefined) {
            await this.adapter.setStateChangedAsync(stateName, value, true);
        }
    }

    async setStateWithTimeoutAsync(stateName, value, timeout) {
        if (value !== undefined) {
            await this.adapter.setStateAsync(stateName, value, true);
            if (timeOutCache[stateName]) {
                clearTimeout(timeOutCache[stateName]);
            }
            timeOutCache[stateName] = setTimeout(() => {
                this.adapter.setStateAsync(stateName, !value, true);
            }, timeout);
        }
    }

    processQueue() {
        const oldIncStatsQueue = [];
        utils.moveArray(incStatsQueue, oldIncStatsQueue);
        while (oldIncStatsQueue.length > 0) {
            this.processDeviceMessage(oldIncStatsQueue.shift());
        }
    }

    async subscribeWritableStates() {
        await this.adapter.unsubscribeObjectsAsync('*');
        for (const device of this.groupCache.concat(this.deviceCache)) {
            for (const state of device.states) {
                if (state.write == true) {
                    this.adapter.subscribeStates(`${device.ieee_address}.${state.id}`);
                }
            }
        }
        this.adapter.subscribeStates('info.debugmessages');
        this.adapter.subscribeStates('info.logfilter');
    }

    async setAllAvailableToFalse() {
        for (const device of this.deviceCache) {
            for (const state of device.states) {
                if (state.id == 'available') {
                    await this.adapter.setStateChangedAsync(`${device.ieee_address}.${state.id}`, false, true);
                }
            }
        }
    }

    async allTimerClear() {
        for (const timer in timeOutCache) {
            clearTimeout(timeOutCache[timer]);
        }
    }
}

module.exports = {
    StatesController
};