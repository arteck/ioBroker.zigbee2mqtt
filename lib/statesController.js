const utils = require('./utils');
const incStatsQueue = [];
const timeOutCache = {};

class StatesController {
	constructor(adapter, deviceCache, groupCache, logCustomizations) {
		this.adapter = adapter;
		this.groupCache = groupCache;
		this.deviceCache = deviceCache;
		this.logCustomizations = logCustomizations;
	}

	async processDeviceMessage(messageObj) {
		// Is payload present?
		if (messageObj.payload == '') {
			return;
		}

		const device = this.groupCache.concat(this.deviceCache).find(x => x.id == messageObj.topic);
		if (device) {
			try {
				this.setDeviceState(messageObj, device);
			} catch (error) {
				this.adapter.log.error(error);
			}
		} else {
			incStatsQueue[incStatsQueue.length] = messageObj;
			this.adapter.log.debug(`Device: ${messageObj.topic} not found, queue state in incStatsQueue!`);
		}
	}

	async setDeviceState(messageObj, device) {
		if (this.logCustomizations.debugDevices.includes(device.ieee_address)) {
			this.adapter.log.warn(`--->>> fromZ2M -> ${device.ieee_address} states: ${JSON.stringify(messageObj)}`);
		}

		for (const [key, value] of Object.entries(messageObj.payload)) {
			let states;
			if (key == 'action') {
				states = device.states.filter(x => (x.prop && x.prop == key));
			} else {
				states = device.states.filter(x => (x.prop && x.prop == key) || x.id == key);
			}

			for (const state of states) {
				if (!state) {
					continue;
				}

				const stateName = `${device.ieee_address}.${state.id}`;

				try {
					if (state.isEvent) {
						if (state.getter) {
							await this.setStateWithTimeoutAsync(stateName, state.getter(messageObj.payload), 300);
						} else {
							await this.setStateWithTimeoutAsync(stateName, value, 300);
						}
					} else {
						if (state.getter) {
							await this.setStateChangedAsync(stateName, state.getter(messageObj.payload));
						} else {
							await this.setStateChangedAsync(stateName, value);
						}
					}
				} catch (err) {
					incStatsQueue[incStatsQueue.length] = messageObj;
					this.adapter.log.debug(`Can not set ${stateName}, queue state in incStatsQueue!`);
				}
			}
		}
	}

	async setStateAsync(stateName, value) {
		if (value !== undefined) {
			await this.adapter.setStateAsync(stateName, value, true);
		}
	}

	async setStateChangedAsync(stateName, value) {
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

	async processQueue() {
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
					this.adapter.subscribeStatesAsync(`${device.ieee_address}.${state.id}`);
				}
			}
		}
		this.adapter.subscribeStatesAsync('info.debugmessages');
		this.adapter.subscribeStatesAsync('info.logfilter');
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