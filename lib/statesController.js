const utils = require('./utils');

/**
 *
 */
class StatesController {
    /**
     *
     * @param adapter
     * @param deviceCache
     * @param groupCache
     * @param logCustomizations
     * @param createCache
     */
    constructor(adapter, deviceCache, groupCache, logCustomizations, createCache) {
        this.adapter = adapter;
        this.groupCache = groupCache;
        this.deviceCache = deviceCache;
        this.logCustomizations = logCustomizations;
        this.createCache = createCache;
        this.incStatsQueue = [];
        this.timeOutCache = {};
    }

    /**
     *
     * @param messageObj
     */
    async processDeviceMessage(messageObj) {
        if (!messageObj || typeof messageObj !== 'object') {
            return;
        }
        if (messageObj.payload === '' || messageObj.payload === undefined || messageObj.payload === null) {
            return;
        }

        const device = this.groupCache.concat(this.deviceCache).find((x) => x.id == messageObj.topic);
        if (device) {
            try {
                await this.setDeviceStateSafely(messageObj, device);
            } catch (error) {
                this.adapter.log.error(`setDeviceStateSafely error for ${messageObj.topic}: ${error}`);
            }
        } else {
            if (!this.incStatsQueue.some((x) => x && x.topic === messageObj.topic)) {
                if (this.incStatsQueue.length < 500) {
                    this.incStatsQueue.push(messageObj);
                } else {
                    this.adapter.log.warn(`incStatsQueue is full (500), dropping message for ${messageObj.topic}`);
                }
            }
            this.adapter.log.debug(`Device: ${messageObj.topic} not found, queue state in incStatsQueue!`);
        }
    }

    /**
     *
     * @param messageObj
     * @param device
     */
    async setDeviceStateSafely(messageObj, device) {
        if (this.logCustomizations.debugDevices.includes(device.ieee_address)) {
            this.adapter.log.warn(`--->>> fromZ2M -> ${device.ieee_address} states: ${JSON.stringify(messageObj)}`);
        }

        const actionStates = [];
        // Fix 1: Flag damit messageObj nur EINMAL in die Queue kommt, egal wie viele
        //         States noch nicht im createCache sind (verhindert N-faches Requeue)
        let queuedThisRound = false;

        const pushToQueue = (msg) => {
            if (!queuedThisRound && this.incStatsQueue.length < 500
                && !this.incStatsQueue.some((x) => x && x.topic === msg.topic)) {
                this.incStatsQueue.push(msg);
                queuedThisRound = true;
            }
        };

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

                // State noch nicht erstellt? → einmal in Queue legen und weiter
                if (!this.createCache[device.ieee_address]
                ||  !this.createCache[device.ieee_address][state.id]
                ||  this.createCache[device.ieee_address][state.id].created !== true) {
                    pushToQueue(messageObj);
                    continue;
                }

                try {
                    //  Is an action
                    if (state.prop && state.prop == 'action') {
                        actionStates.push(state);
                    }
                    else if (this.adapter.config.allwaysUpdateOccupancyState === true && state.id === 'occupancy' && value === true) {
                        await this.setStateSafelyAsync(stateName, value);
                    }
                    else {
                        if (state.getter) {
                            await this.setStateChangedSafelyAsync(stateName, state.getter(messageObj.payload));
                        } else {
                            await this.setStateChangedSafelyAsync(stateName, value);
                        }
                    }
                } catch (err) {
                    // Fix 2: Größenlimit auch hier
                    pushToQueue(messageObj);
                    this.adapter.log.debug(`Can not set ${stateName}, queue state in incStatsQueue!`);
                }
            }
        }

        for (const state of actionStates) {
            const stateName = `${device.ieee_address}.${state.id}`;

            try {
                const getterPayload = state.getter(messageObj.payload);
                if (getterPayload != undefined) {
                    if (state.isEvent && state.isEvent == true) {
                        if (state.type == 'boolean') {
                            await this.setStateWithTimeoutAsync(stateName, getterPayload, 250);
                        } else {
                            await this.setStateSafelyAsync(stateName, getterPayload);
                        }
                    } else {
                        await this.setStateChangedSafelyAsync(stateName, getterPayload);
                    }
                }
            } catch (err) {
                // Fix 2: Größenlimit auch hier
                pushToQueue(messageObj);
                this.adapter.log.debug(`Can not set ${stateName}, queue state in incStatsQueue!`);
            }
        }
    }

    /**
     *
     * @param stateName
     * @param value
     */
    async setStateSafelyAsync(stateName, value) {
        if (value === undefined || value === null) {
            return;
        }
        await this.adapter.setStateAsync(stateName, value, true);
    }

    /**
     *
     * @param stateName
     * @param value
     */
    async setStateChangedSafelyAsync(stateName, value) {
        if (value === undefined || value === null) {
            return;
        }
        await this.adapter.setStateChangedAsync(stateName, value, true);
    }

    /**
     *
     * @param stateName
     * @param value
     * @param timeout
     */
    async setStateWithTimeoutAsync(stateName, value, timeout) {
        if (value === undefined || value === null) {
            return;
        }

        await this.adapter.setStateAsync(stateName, value, true);
        if (this.timeOutCache[stateName]) {
            clearTimeout(this.timeOutCache[stateName]);
        }
        this.timeOutCache[stateName] = setTimeout(() => {
            this.adapter.setStateAsync(stateName, !value, true).catch((err) => {
                this.adapter.log.debug(`setStateWithTimeout reset error for ${stateName}: ${err}`);
            });
        }, timeout);
    }

    /**
     *
     */
    async processQueue() {
        const oldIncStatsQueue = [];
        utils.moveArray(this.incStatsQueue, oldIncStatsQueue);
        while (oldIncStatsQueue.length > 0) {
            // seriell abarbeiten – nicht parallel feuern
            await this.processDeviceMessage(oldIncStatsQueue.shift());
        }
    }

    /**
     *
     */
    async subscribeWritableStates() {
        await this.adapter.unsubscribeObjectsAsync('*');
        for (const device of this.groupCache.concat(this.deviceCache)) {
            if (!device || !Array.isArray(device.states)) {
                continue;
            }
            for (const state of device.states) {
                if (state && state.write === true) {
                    this.adapter.subscribeStates(`${device.ieee_address}.${state.id}`);
                }
            }
        }
        this.adapter.subscribeStates('info.debugmessages');
        this.adapter.subscribeStates('info.logfilter');
        this.adapter.subscribeStates('info.coordinator_check');
    }

    /**
     *
     */
    async setAllAvailableToFalse() {
        const availableStates = await this.adapter.getStatesAsync('*.available');
        // Fix: Object.keys() statt for...in verhindert ungewollte Prototype-Properties
        for (const availableState of Object.keys(availableStates)) {
            await this.adapter.setStateChangedAsync(availableState, false, true);
        }
    }

    /**
     *
     */
    async allTimerClear() {
        for (const timer of Object.keys(this.timeOutCache)) {
            clearTimeout(this.timeOutCache[timer]);
        }
        this.timeOutCache = {};
    }
}

module.exports = {
    StatesController,
};
