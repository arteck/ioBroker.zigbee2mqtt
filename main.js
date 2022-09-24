'use strict';

/*
 * Created with @iobroker/create-adapter v2.2.1
 */

// The adapter-core module gives you access to the core ioBroker functions
// you need to create an adapter
const core = require('@iobroker/adapter-core');
const WebSocket = require('ws');
const applyExposes = require('./lib/exposes').applyExposes;
let wsClient;
let adapter;
let createDevicesReady = false;
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

	async messageParse(data) {
		const dataObj = JSON.parse(data);

		switch (dataObj.topic) {
			case 'bridge/config':
				break;
			case 'bridge/info':
				break;
			case 'bridge/state':
				break;
			case 'bridge/devices':
				// As long as we are busy creating the devices, the states are written to the queue.
				createDevicesReady = false;
				await this.createDevices(dataObj.payload);
				createDevicesReady = true;

				// Now process all entries in the states queue
				while (incStatsQueue.length > 0) {
					this.processDeviceMessage(incStatsQueue.shift());
				}
				break;
			case 'bridge/groups':
				//await createGroup(data);
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
					adapter.log.debug(JSON.stringify(dataObj));
					// As long as we are busy creating the devices, the states are written to the queue.
					if (createDevicesReady == false) {
						incStatsQueue[incStatsQueue.length] = dataObj;
						break;
					}
					this.processDeviceMessage(dataObj);
				}
				break;
		}
	}

	async processDeviceMessage(dataObj) {
		const device = deviceCache.find(x => x.id == dataObj.topic);
		adapter.log.debug('States');
		if (device) {
			try {
				this.setDeviceState(dataObj, device);

			} catch (error) {
				adapter.log.error(error);
			}
		}
		else {
			adapter.log.warn(`Device: ${dataObj.topic} not found`);
		}
	}

	async setDeviceState(dataObj, device) {

		for (const [key, value] of Object.entries(dataObj.payload)) {
			// adapter.log.debug(`key: ${key}`);
			// adapter.log.debug(`value: ${value}`);
			const states = device.states.filter(x => (x.prop && x.prop == key) || x.id == key);

			for (const state of states) {

				adapter.log.debug(JSON.stringify(state));
				if (!state) {
					continue;
				}
				const stateName = `${device.ieee_address}.${state.id}`;

				if (state.getter) {
					//adapter.log.debug(`state.getter(value): ${state.getter(dataObj.payload)}`);
					this.setState(stateName, state.getter(dataObj.payload), true);
				}
				else {
					this.setState(stateName, value, true);
				}
			}
		}
	}

	async createDevices(exposes) {

		for (const expose of exposes) {
			//adapter.log.debug(JSON.stringify(device.definition));

			if (expose.definition != null) {
				applyExposes(deviceCache, expose.friendly_name, expose.ieee_address, expose.definition);
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

			//adapter.log.debug(JSON.stringify(deviceCache));
		}
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
		if (state) {
			// The state was changed
			this.log.info(`state ${id} changed: ${state.val} (ack = ${state.ack})`);
		} else {
			// The state was deleted
			this.log.info(`state ${id} deleted`);
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
