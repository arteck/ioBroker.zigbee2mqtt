'use strict';

/*
 * Created with @iobroker/create-adapter v2.2.1
 */

// The adapter-core module gives you access to the core ioBroker functions
// you need to create an adapter
const utils = require('@iobroker/adapter-core');
const WebSocket = require('ws');
let wsClient;
let adapter;
const deviceCreateCache = {};

// Load your modules here, e.g.:
// const fs = require("fs");

class Zigbee2mqtt extends utils.Adapter {
	/**
	 * @param {Partial<utils.AdapterOptions>} [options={}]
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


		/*
		For every state in the system there has to be also an object of type state
		Here a simple template for a boolean variable named "testVariable"
		Because every adapter instance uses its own unique namespace variable names can't collide with other adapters variables
		*/
		// await this.setObjectNotExistsAsync('testVariable', {
		// 	type: 'state',
		// 	common: {
		// 		name: 'testVariable',
		// 		type: 'boolean',
		// 		role: 'indicator',
		// 		read: true,
		// 		write: true,
		// 	},
		// 	native: {},
		// });

		// In order to get state updates, you need to subscribe to them. The following line adds a subscription for our variable we have created above.
		// this.subscribeStates('testVariable');
		// You can also add a subscription for multiple states. The following line watches all states starting with "lights."
		// this.subscribeStates('lights.*');
		// Or, if you really must, you can also watch all states. Don't do this if you don't need to. Otherwise this will cause a lot of unnecessary load on the system:
		// this.subscribeStates('*');

		/*
			setState examples
			you will notice that each setState will cause the stateChange event to fire (because of above subscribeStates cmd)
		*/
		// the variable testVariable is set to true as command (ack=false)
		// await this.setStateAsync('testVariable', true);

		// same thing, but the value is flagged "ack"
		// ack should be always set to true if the value is received from or acknowledged from the target system
		// await this.setStateAsync('testVariable', { val: true, ack: true });

		// same thing, but the state is deleted after 30s (getState will return null afterwards)
		// await this.setStateAsync('testVariable', { val: true, ack: true, expire: 30 });

		// examples for the checkPassword/checkGroup functions
		// let result = await this.checkPasswordAsync('admin', 'iobroker');
		// this.log.info('check user admin pw iobroker: ' + result);

		// result = await this.checkGroupAsync('admin', 'admin');
		// this.log.info('check group user admin group admin: ' + result);
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
		adapter.log.debug(data);
		const dataObj = JSON.parse(data);

		switch (dataObj.topic) {
			case 'bridge/config':
				break;
			case 'bridge/info':
				break;
			case 'bridge/state':
				break;
			case 'bridge/devices':
				this.createDevices(dataObj.payload);
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
				break;

		}
	}

	async createDevices(devices) {

		for (const device of devices) {
			if (!deviceCreateCache[device.ieee_address]) {
				await this.setObjectNotExistsAsync(device.ieee_address, {
					type: 'channel',
					common: {
						name: device.friendly_name
					},
					native: {}
				});
				deviceCreateCache[device.ieee_address] = {};
			}

			if (!device.definition || !device.definition.exposes) {
				continue;
			}

			for (const exposes of device.definition.exposes) {
				if (!deviceCreateCache[device.ieee_address][exposes.name]) {
					const stateObj = {
						type: 'state',
						common: {
							name: exposes.description,
							type: this.typeMapper(exposes.type),
							role: 'indicator',
							unit: exposes.unit,
							read: true,
							write: exposes.access != 1
						},
						native: {},
					};

					if (exposes.type == 'enum') {
						for (const val of exposes.values) {
							stateObj.common.states += `${val}:${val};`;
						}
						if (stateObj.common.states.length > 1) {
							stateObj.common.states = stateObj.common.states.slice(0, -1);
						}
					}

					// @ts-ignore
					await this.setObjectNotExistsAsync(`${device.ieee_address}.${exposes.name}`, stateObj);
					deviceCreateCache[device.ieee_address][exposes.name] = {};
				}
			}
		}
	}

	typeMapper(inType) {
		switch (inType) {
			case 'numeric':
				return 'number';
			case 'binary':
				return 'boolean';
			case 'enum':
				return 'string';
			default:
				return inType;

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
	 * @param {Partial<utils.AdapterOptions>} [options={}]
	 */
	module.exports = (options) => new Zigbee2mqtt(options);
} else {
	// otherwise start the instance directly
	new Zigbee2mqtt();
}
