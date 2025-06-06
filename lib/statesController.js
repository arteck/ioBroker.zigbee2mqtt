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

        const device = this.groupCache.concat(this.deviceCache).find((x) => x.id == messageObj.topic);
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

        const actionStates = [];

        for (let [key, value] of Object.entries(messageObj.payload)) {
            if (value === undefined || value === null) {
                continue;
            }

            let states = device.states.filter(state => {
                return state.prop && state.prop === key;
            });

            if (states.length == 0) {
                states = device.states.filter((x) => x.id == key);
            }

            if (states.length == 0) {
                if (key == 'device' || device.ieee_address.includes('group')) {
                    // do nothing
                } else {
                    // some devices has addition information in payload
                    const fullPath = `${device.ieee_address}.additional`;

                    await this.adapter.setObjectNotExistsAsync(fullPath, {
                        type: 'channel',
                        common: {
                            name: 'hidden channelstate',
                        },
                        native: {},
                    });
                    await this.adapter.setObjectNotExistsAsync(`${fullPath}.${key}`, {
                        type: 'state',
                        common: {
                            name: key,
                            role: 'state',
                            type: value !== null ? typeof value : 'mixed',
                            write: false,
                            read: true,
                        },
                        native: {},
                    });
                    if (typeof value == 'object') {
                        value = JSON.stringify(value);
                    }
                    this.adapter.setState(`${fullPath}.${key}`, value, true);
                }
                continue;
            }

            for (const state of states) {
                const stateName = `${device.ieee_address}.${state.id}`;

                // set available status if last_seen is set
                if (state.id === 'last_seen' && this.adapter.config.allwaysUpdateAvailableState === true) {
                    await this.setStateSafelyAsync(`${device.ieee_address}.available`, true);
                }

                // It may be that the state has not yet been created!
                if (!this.createCache[device.ieee_address]
				||	!this.createCache[device.ieee_address][state.id]
				||	!this.createCache[device.ieee_address][state.id].created == true) {
                    incStatsQueue[incStatsQueue.length] = messageObj;
                    continue;
                }

                try {
                    //  Is an action
                    if (state.prop && state.prop == 'action') {
                        actionStates.push(state);
                    }
                    // Is not an action
                    // check if its a motion sensor (occupancy state) and if configuration is set to update state every time
                    // if yes, use setStateSafelyAsync instead of setStateChangedSafelyAsync
                    else if (
                        this.adapter.config.allwaysUpdateOccupancyState === true &&
						state.id === 'occupancy' &&
						value === true
                    ) {
                        await this.setStateSafelyAsync(stateName, value);
                    }
                    // end section for motion sensor update
                    else {
                        if (state.getter) {
                            await this.setStateChangedSafelyAsync(stateName, state.getter(messageObj.payload));
                        } else {
                            await this.setStateChangedSafelyAsync(stateName, value);
                        }
                    }
                } catch (err) {
                    incStatsQueue[incStatsQueue.length] = messageObj;
                    this.adapter.log.debug(`Can not set ${stateName}, queue state in incStatsQueue!`);
                }
            }
        }

        for (const state of actionStates) {
            const stateName = `${device.ieee_address}.${state.id}`;

            try {
                if (state.isEvent && state.isEvent == true) {
                    if (state.type == 'boolean') {
                        await this.setStateWithTimeoutAsync(stateName, state.getter(messageObj.payload), 450);
                    } else {
                        await this.setStateSafelyAsync(stateName, state.getter(messageObj.payload));
                    }
                } else {
                    await this.setStateChangedSafelyAsync(stateName, state.getter(messageObj.payload));
                }
            } catch (err) {
                incStatsQueue[incStatsQueue.length] = messageObj;
                this.adapter.log.debug(`Can not set ${stateName}, queue state in incStatsQueue!`);
            }
        }
    }

    async setStateSafelyAsync(stateName, value) {
        if (value === undefined || value === null) {
            return;
        }
        await this.adapter.setStateAsync(stateName, value, true);
    }

    async setStateChangedSafelyAsync(stateName, value) {
        if (value === undefined || value === null) {
            return;
        }
        await this.adapter.setStateChangedAsync(stateName, value, true);
    }

    async setStateWithTimeoutAsync(stateName, value, timeout) {
        if (value === undefined || value === null) {
            return;
        }

        await this.adapter.setStateAsync(stateName, value, true);
        if (timeOutCache[stateName]) {
            clearTimeout(timeOutCache[stateName]);
        }
        timeOutCache[stateName] = setTimeout(() => {
            this.adapter.setStateAsync(stateName, !value, true);
        }, timeout);
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
        this.adapter.subscribeStates('info.coordinator_check');
    }

    async setAllAvailableToFalse() {
        const availableStates = await this.adapter.getStatesAsync('*.available');
        for (const availableState in availableStates) {
            await this.adapter.setStateChangedAsync(availableState, false, true);
        }
    }

    async allTimerClear() {
        for (const timer in timeOutCache) {
            clearTimeout(timeOutCache[timer]);
        }
    }
}

module.exports = {
    StatesController,
};
