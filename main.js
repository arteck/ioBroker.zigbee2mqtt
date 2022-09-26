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
let ping;
let pingTimeout;
let autoRestartTimeout;
const wsHeartbeatIntervall = 5000;
const restartTimeout = 1000;

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
		this.on('unload', this.onUnload.bind(this));
	}

	/**
	 * Is called when databases are connected and adapter received configuration.
	 */
	async onReady() {
		// Initialize your adapter here
		adapter = this;
		this.log.info('Zigbee2MQTT Frontend Server: ' + this.config.server);
		this.log.info('Zigbee2MQTT Frontend Port: ' + this.config.port);
		this.setStateAsync('info.connection', false, true);
		this.createWsClient(this.config.server, this.config.port);
	}

	async createWsClient(server, port) {
		try {
			wsClient = new WebSocket(`ws://${server}:${port}/api`);
			wsClient.on('open', () => {
				this.log.debug('Websocket connectet');
				// Set connection state
				this.setState('info.connection', true, true);
				this.log.info('Connect to server over websocket connection.');
				// Send ping to server
				this.sendPingToServer();
				// Start Heartbeat
				this.wsHeartbeat();
			});
			wsClient.on('pong', () => {
				this.log.debug('Receive pong from server');
				this.wsHeartbeat();
			});
			// On Close
			wsClient.on('close', () => {
				this.setState('info.connection', false, true);
				this.log.warn('Websocket disconnectet');
				clearTimeout(ping);
				clearTimeout(pingTimeout);

				if (wsClient.readyState === WebSocket.CLOSED) {
					this.autoRestart();
				}
			});

			wsClient.on('message', (message) => { this.messageParse(message); });
			wsClient.on('error', (err) => { adapter.log.debug(err); });
		} catch (err) {
			this.log.debug(err);
		}
	}

	async sendPingToServer() {
		this.log.debug('Send ping to server');
		wsClient.ping();
		ping = setTimeout(() => {
			this.sendPingToServer();
		}, wsHeartbeatIntervall);
	}

	async wsHeartbeat() {
		clearTimeout(pingTimeout);
		pingTimeout = setTimeout(() => {
			this.log.debug('Websocked connection timed out');
			wsClient.terminate();
		}, wsHeartbeatIntervall + 1000);
	}

	async autoRestart() {
		this.log.warn(`Start try again in ${restartTimeout / 1000} seconds...`);
		autoRestartTimeout = setTimeout(() => {
			this.onReady();
		}, restartTimeout);
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
			if (!value || value == '') {
				continue;
			}

			let states;
			if (key == 'action') {
				states = device.states.filter(x => (x.prop && x.prop == key) && x.id == value);
			} else {
				states = device.states.filter(x => (x.prop && x.prop == key) || x.id == key);
			}

			for (const state of states) {
				if (!state) {
					continue;
				}
				const stateName = `${device.ieee_address}.${state.id}`;

				if (state.getter) {
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
			const deviceName = device.id == device.ieee_address ? '' : device.id;
			if (!deviceCreateCache[device.ieee_address] || deviceCreateCache[device.ieee_address].common.name != deviceName) {
				const deviceObj = {
					type: 'channel',
					common: {
						name: deviceName
					},
					native: {}
				};
				//@ts-ignore
				await this.extendObjectAsync(device.ieee_address, deviceObj);
				deviceCreateCache[device.ieee_address] = deviceObj;
			}

			for (const state of device.states) {
				if (!deviceCreateCache[device.ieee_address][state.id]) {
					await this.extendObjectAsync(`${device.ieee_address}.${state.id}`, {
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

	async createZ2MMessage(id, state) {

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

		const controlObj = {
			payload: {
				[stateID]: stateVal
			},
			topic: topic
		};

		return JSON.stringify(controlObj);
	}

	/**
	 * Is called when adapter shuts down - callback has to be called under any circumstances!
	 * @param {() => void} callback
	 */
	onUnload(callback) {
		try {
			clearTimeout(ping);
			clearTimeout(pingTimeout);
			clearTimeout(autoRestartTimeout);
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
	async onStateChange(id, state) {
		if (state && state.ack == false) {
			const message = await this.createZ2MMessage(id, state);
			wsClient.send(message);
		}
	}
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
