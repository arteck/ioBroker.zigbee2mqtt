'use strict';

/*
 * Created with @iobroker/create-adapter v2.2.1
 */

// The adapter-core module gives you access to the core ioBroker functions
// you need to create an adapter
const core = require('@iobroker/adapter-core');
const WebSocket = require('ws');
const applyExposes = require('./lib/exposes').applyExposes;
const createGroupDevice = require('./lib/groups').createGroupDevice;
let wsClient;
let adapter;
let createDevicesOrReady = false;
const incStatsQueue = [];
const deviceCreateCache = {};
const deviceCache = [];

// Load your modules here, e.g.:
// const fs = require("fs");

class Zigbee2mqtt extends core.Adapter {
	/**
	 * @param {Partial<core.AdapterOptions>} [options={}]
	 */
	constructor(options) {
		super({
			...options,
			name: 'zigbee2mqtt',
		});
		this.on('ready', this.onReady.bind(this));
		this.on('stateChange', this.onStateChange.bind(this));
		// this.on('objectChange', this.onObjectChange.bind(this));
		// this.on('message', this.onMessage.bind(this));
		this.on('unload', this.onUnload.bind(this));
	}

	/**
	 * Is called when databases are connected and adapter received configuration.
	 */
	async onReady() {
		// Initialize your adapter here
		adapter = this;
		// The adapters config (in the instance object everything under the attribute "native") is accessible via
		// this.config:
		this.log.info('config option1: ' + this.config.server);
		this.log.info('config option2: ' + this.config.port);

		this.createWsClient(this.config.server, this.config.port);
	}

	async createWsClient(server, port) {
		try {
			wsClient = new WebSocket(`ws://${server}:${port}/api`);
			wsClient.on('open', () => { });
			wsClient.on('message', (data) => { this.messageParse(data); });
			wsClient.on('error', (data) => { adapter.log.debug(data); });
		} catch (err) {
			this.log.debug(err);
		}
	}

	async messageParse(message) {
		const messageObj = JSON.parse(message);

		switch (messageObj.topic) {
			case 'bridge/config':
				break;
			case 'bridge/info':
				break;
			case 'bridge/state':
				break;
			case 'bridge/devices':
				// As long as we are busy creating the devices, the states are written to the queue.
				createDevicesOrReady = false;
				await this.createDevicesOrGroups(messageObj);
				createDevicesOrReady = true;

				// Now process all entries in the states queue
				while (incStatsQueue.length > 0) {
					this.processDeviceMessage(incStatsQueue.shift());
				}

				this.subscribeWritableStates();
				break;
			case 'bridge/groups':
				await this.createDevicesOrGroups(messageObj);
				break;
			case 'bridge/event':
				break;
			case 'bridge/extensions':
				break;
			case 'bridge/logging':
				break;
			case 'bridge/response/networkmap':
				break;
			case 'bridge/response/touchlink/scan':
				break;
			case 'bridge/response/touchlink/identify':
				break;
			case 'bridge/response/touchlink/factory_reset':
				break;
			default:
				// States
				{
					//adapter.log.debug(JSON.stringify(messageObj));
					if (!messageObj.topic.includes('/')) {
						// As long as we are busy creating the devices, the states are written to the queue.
						if (createDevicesOrReady == false) {
							incStatsQueue[incStatsQueue.length] = messageObj;
							break;
						}
						this.processDeviceMessage(messageObj);
					}
				}
				break;
		}
	}

	async processDeviceMessage(messageObj) {
		// Is payload present?
		if (messageObj.payload == '') {
			return;
		}

		const device = deviceCache.find(x => x.id == messageObj.topic);
		if (device) {
			try {
				this.setDeviceState(messageObj, device);

			} catch (error) {
				adapter.log.error(error);
			}
		}
		else {
			adapter.log.warn(`Device: ${messageObj.topic} not found`);
		}
	}

	async setDeviceState(messageObj, device) {

		for (const [key, value] of Object.entries(messageObj.payload)) {
			// adapter.log.debug(`key: ${key}`);
			// adapter.log.debug(`value: ${value}`);
			const states = device.states.filter(x => (x.prop && x.prop == key) || x.id == key);

			for (const state of states) {

				//adapter.log.debug(JSON.stringify(state));
				if (!state) {
					continue;
				}
				const stateName = `${device.ieee_address}.${state.id}`;

				if (state.getter) {
					//adapter.log.debug(`state.getter(value): ${state.getter(dataObj.payload)}`);
					this.setState(stateName, state.getter(messageObj.payload), true);
				}
				else {
					this.setState(stateName, value, true);
				}
			}
		}
	}

	async createDevicesOrGroups(messageObj) {

		for (const expose of messageObj.payload) {
			//adapter.log.debug(JSON.stringify(device.definition));
			if (messageObj.topic == 'bridge/devices') {
				if (expose.definition != null) {
					applyExposes(deviceCache, expose.friendly_name, expose.ieee_address, expose.definition);
				}
			}
			else if (messageObj.topic == 'bridge/groups') {
				createGroupDevice(deviceCache, expose.friendly_name, `group_${expose.id}`);
			}
		}


		for (const device of deviceCache) {
			if (!deviceCreateCache[device.ieee_address]) {
				await this.setObjectNotExistsAsync(device.ieee_address, {
					type: 'channel',
					common: {
						name: device.id == device.ieee_address ? '' : device.id
					},
					native: {}
				});
				deviceCreateCache[device.ieee_address] = {};
			}

			for (const state of device.states) {
				if (!deviceCreateCache[device.ieee_address][state.id]) {
					await this.setObjectNotExistsAsync(`${device.ieee_address}.${state.id}`, {
						type: 'state',
						common: state,
						native: {},
					});
					deviceCreateCache[device.ieee_address][state.id] = {};
				}
			}
		}
	}

	async subscribeWritableStates() {
		for (const device of deviceCache) {
			for (const state of device.states) {
				if (state.write == true) {
					this.subscribeStates(`${device.ieee_address}.${state.id}`);
				}
			}
		}
	}

	async z2m_command(ieee, pl_name, val) {
		this.z2m_send(`{"payload":{"${pl_name}":"${val}"},"topic":"${ieee}/set"}`);
		adapter.log.info(`{"payload":{"${pl_name}":"${val}"},"topic":"${ieee}/set"}`);
	}

	async z2m_send(id, state) {

		const splitedID = id.split('.');

		if (splitedID.length < 4) {
			this.log.warn(`state ${id} not valid`);
			return;
		}

		const ieee_address = splitedID[2];
		const stateName = splitedID[3];

		const device = deviceCache.find(d => d.ieee_address == ieee_address);

		if (!device) {
			return;
		}

		const deviceState = device.states.find(s => s.id == stateName);

		if (!deviceState) {
			return;
		}

		this.log.debug(JSON.stringify(deviceState));

		let stateVal = state.val;
		if (deviceState.setter) {
			stateVal = deviceState.setter(state.val);
		}


		let stateID = deviceState.id;
		if (deviceState.prop) {
			stateID = deviceState.prop;
		}

		let topic = `${device.ieee_address}/set`;
		if (device.ieee_address.includes('group_')) {
			topic = `${device.id}/set`;
		}

		this.log.debug(JSON.stringify(stateVal));

		const controlObj = {
			payload: {
				[stateID]: stateVal
			},
			topic: topic
		};

		adapter.log.debug(JSON.stringify(controlObj));
		wsClient.send(JSON.stringify(controlObj));
	}


	/**
	 * Is called when adapter shuts down - callback has to be called under any circumstances!
	 * @param {() => void} callback
	 */
	onUnload(callback) {
		try {
			// Here you must clear all timeouts or intervals that may still be active
			// clearTimeout(timeout1);
			// clearTimeout(timeout2);
			// ...
			// clearInterval(interval1);

			callback();
		} catch (e) {
			callback();
		}
	}



	/**
	 * Is called if a subscribed state changes
	 * @param {string} id
	 * @param {ioBroker.State | null | undefined} state
	 */
	onStateChange(id, state) {
		if (state && state.ack == false) {
			// The state was changed
			this.log.info(`state ${id} changed: ${state.val} (ack = ${state.ack})`);
			this.z2m_send(id, state);

		}
	}


	// If you need to accept messages in your adapter, uncomment the following block and the corresponding line in the constructor.
	// /**
	//  * Some message was sent to this instance over message box. Used by email, pushover, text2speech, ...
	//  * Using this method requires "common.messagebox" property to be set to true in io-package.json
	//  * @param {ioBroker.Message} obj
	//  */
	// onMessage(obj) {
	// 	if (typeof obj === 'object' && obj.message) {
	// 		if (obj.command === 'send') {
	// 			// e.g. send email or pushover or whatever
	// 			this.log.info('send command');

	// 			// Send response in callback if required
	// 			if (obj.callback) this.sendTo(obj.from, obj.command, 'Message received', obj.callback);
	// 		}
	// 	}
	// }

	// If you need to react to object changes, uncomment the following block and the corresponding line in the constructor.
	// You also need to subscribe to the objects with `this.subscribeObjects`, similar to `this.subscribeStates`.
	// /**
	//  * Is called if a subscribed object changes
	//  * @param {string} id
	//  * @param {ioBroker.Object | null | undefined} obj
	//  */
	// onObjectChange(id, obj) {
	// 	if (obj) {
	// 		// The object was changed
	// 		this.log.info(`object ${id} changed: ${JSON.stringify(obj)}`);
	// 	} else {
	// 		// The object was deleted
	// 		this.log.info(`object ${id} deleted`);
	// 	}
	// }
}

if (require.main !== module) {
	// Export the constructor in compact mode
	/**
	 * @param {Partial<core.AdapterOptions>} [options={}]
	 */
	module.exports = (options) => new Zigbee2mqtt(options);
} else {
	// otherwise start the instance directly
	new Zigbee2mqtt();
}
