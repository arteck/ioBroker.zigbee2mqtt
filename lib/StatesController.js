const utils = require('./utils');
const incStatsQueue = [];

class StatesController {
	constructor(adapter, deviceCache, groupCache, debugDevices) {
		this.adapter = adapter;
		this.groupCache = groupCache;
		this.deviceCache = deviceCache;
		this.debugDevices = debugDevices;
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
		}
		else {
			incStatsQueue[incStatsQueue.length] = messageObj;
			this.adapter.log.debug(`Device: ${messageObj.topic} not found, queue state in incStatsQueue!`);
		}
	}

	async setDeviceState(messageObj, device) {
		if (this.debugDevices.includes(device.ieee_address)) {
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
						}
						else {
							await this.setStateWithTimeoutAsync(stateName, value, 300);
						}
					}
					else {
						if (state.getter) {
							await this.setStateAsync(stateName, state.getter(messageObj.payload));
						}
						else {
							await this.setStateAsync(stateName, value);
						}
					}
				} catch (err) {
					//this.adapter.log.warn(`Can not set ${stateName}`);
					incStatsQueue[incStatsQueue.length] = messageObj;
					this.adapter.log.debug(`Can not set ${stateName} for ${messageObj.topic}, queue state in incStatsQueue!`);
				}
			}
		}
	}

	async setStateAsync(stateName, value) {
		if (value !== undefined) {
			await this.adapter.setStateAsync(stateName, value, true);
		}
	}

	async setStateWithTimeoutAsync(stateName, value, timeout) {
		if (value !== undefined) {
			await this.adapter.setStateAsync(stateName, value, true);
			setTimeout(() => {
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
					await this.adapter.setStateAsync(`${device.ieee_address}.${state.id}`, false, true);
				}
			}
		}
	}
}

module.exports = {
	StatesController
};