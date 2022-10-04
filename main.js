'use strict';

/*
 * Created with @iobroker/create-adapter v2.2.1
 */

// The adapter-core module gives you access to the core ioBroker functions
// you need to create an adapter
const core = require('@iobroker/adapter-core');
const WebSocket = require('ws');
const defineDeviceFromExposes = require('./lib/exposes').defineDeviceFromExposes;
const defineGroupDevice = require('./lib/groups').defineGroupDevice;
const clearArray = require('./lib/utils').clearArray;
let wsClient;
let adapter;
let createDevicesOrReady = false;
const incStatsQueue = [];
const createCache = {};
// eslint-disable-next-line prefer-const
let deviceCache = [];
// eslint-disable-next-line prefer-const
let groupCache = [];
let ping;
let pingTimeout;
let autoRestartTimeout;
const wsHeartbeatIntervall = 5000;
const restartTimeout = 1000;
let debugLogEnabled;
let proxyZ2MLogsEnabled;
let checkAvailableTimout;
let debugDevices = '';
let logfilter = [];
let useKelvin = false;

class Zigbee2mqtt extends core.Adapter {

	constructor(options) {
		super({
			...options,
			name: 'zigbee2mqtt',
		});
		this.on('ready', this.onReady.bind(this));
		this.on('stateChange', this.onStateChange.bind(this));
		this.on('unload', this.onUnload.bind(this));
	}

	async onReady() {
		// Initialize your adapter here
		adapter = this;
		this.log.info(`Zigbee2MQTT Frontend Server: ${this.config.server}`);
		this.log.info(`Zigbee2MQTT Frontend Port: ${this.config.port}`);
		this.log.info(`Zigbee2MQTT Debug Log: ${this.config.debugLogEnabled ? 'activated' : 'deactivated'}`);
		this.log.info(`Proxy Zigbee2MQTT Logs to ioBroker Logs: ${this.config.proxyZ2MLogs ? 'activated' : 'deactivated'}`);
		this.log.info(`Use Kelvin: ${this.config.useKelvin ? 'yes' : 'no'}`);

		this.setStateAsync('info.connection', false, true);
		this.createWsClient(this.config.server, this.config.port);

		debugLogEnabled = this.config.debugLogEnabled;
		proxyZ2MLogsEnabled = this.config.proxyZ2MLogs;
		useKelvin = this.config.useKelvin;

		const debugDevicesState = await this.getStateAsync('info.debugmessages');
		if (debugDevicesState && debugDevicesState.val) {
			debugDevices = String(debugDevicesState.val);
		}

		const logfilterState = await this.getStateAsync('info.logfilter');
		if (logfilterState && logfilterState.val) {
			logfilter = String(logfilterState.val).split(';').filter(x => x); // filter removes empty strings here
		}


		this.subscribeStatesAsync('*');
	}

	async createWsClient(server, port) {
		try {
			wsClient = new WebSocket(`ws://${server}:${port}/api`);
			wsClient.on('open', () => {
				this.logDebug('Websocket connectet');
				// Set connection state
				this.setState('info.connection', true, true);
				this.log.info('Connect to server over websocket connection.');
				// Send ping to server
				this.sendPingToServer();
				// Start Heartbeat
				this.wsHeartbeat();
			});
			wsClient.on('pong', () => {
				//this.logDebug('Receive pong from server');
				this.wsHeartbeat();
			});
			// On Close
			wsClient.on('close', async () => {
				this.setState('info.connection', false, true);
				this.log.warn('Websocket disconnectet');
				await this.setAllAvailableToFalse();
				clearTimeout(ping);
				clearTimeout(pingTimeout);

				if (wsClient.readyState === WebSocket.CLOSED) {
					this.autoRestart();
				}
			});

			wsClient.on('message', (message) => { this.messageParse(message); });
			wsClient.on('error', (err) => { adapter.logDebug(err); });
		} catch (err) {
			this.logDebug(err);
		}
	}

	async sendPingToServer() {
		//this.logDebug('Send ping to server');
		wsClient.ping();
		ping = setTimeout(() => {
			this.sendPingToServer();
		}, wsHeartbeatIntervall);
	}

	async wsHeartbeat() {
		clearTimeout(pingTimeout);
		pingTimeout = setTimeout(() => {
			this.logDebug('Websocked connection timed out');
			wsClient.terminate();
			clearTimeout(checkAvailableTimout);
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
				await this.createDeviceDefinitions(deviceCache, messageObj.payload);
				await this.createOrUpdateDevices(deviceCache);
				this.subscribeWritableStates();
				createDevicesOrReady = true;

				// Now process all entries in the states queue
				while (incStatsQueue.length > 0) {
					this.processDeviceMessage(incStatsQueue.shift());
				}
				break;
			case 'bridge/groups':
				await this.createGroupDefinitions(groupCache, messageObj.payload);
				await this.createOrUpdateDevices(groupCache);
				this.subscribeWritableStates();
				break;
			case 'bridge/event':
				break;
			case 'bridge/extensions':
				break;
			case 'bridge/logging':
				if (proxyZ2MLogsEnabled == true) {
					this.proxyZ2MLogs(messageObj);
				}
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
				{
					// {"payload":{"state":"online"},"topic":"FL.Licht.Links/availability"}  ---->  {"payload":{"available":true},"topic":"FL.Licht.Links"}
					if (messageObj.topic.endsWith('/availability')) {
						const topicSplit = messageObj.topic.split('/');
						if (topicSplit.length == 2 && messageObj.payload && messageObj.payload.state) {
							const newMessage = {
								payload: { available: messageObj.payload.state == 'online' },
								topic: topicSplit[0]
							};
							// As long as we are busy creating the devices, the states are written to the queue.
							if (createDevicesOrReady == false) {
								incStatsQueue[incStatsQueue.length] = newMessage;
								break;
							}
							this.processDeviceMessage(newMessage);
						}
						// States
					} else if (!messageObj.topic.includes('/')) {
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
		this.logDebug(`processDeviceMessage -> messageObj: ${JSON.stringify(messageObj)}`);
		// Is payload present?
		if (messageObj.payload == '') {
			return;
		}

		const device = groupCache.concat(deviceCache).find(x => x.id == messageObj.topic);
		if (device) {
			this.logDebug(`processDeviceMessage -> device: ${JSON.stringify(device)}`);
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

		if (debugDevices.includes(device.ieee_address)) {
			this.log.warn(`--->>> fromZ2M -> ${device.ieee_address} states: ${JSON.stringify(messageObj)}`);
		}

		for (const [key, value] of Object.entries(messageObj.payload)) {
			this.logDebug(`setDeviceState -> key: ${key}`);
			this.logDebug(`setDeviceState -> value: ${JSON.stringify(value)}`);

			let states;
			if (key == 'action') {
				states = device.states.filter(x => (x.prop && x.prop == key) && x.id == value);
			} else {
				states = device.states.filter(x => (x.prop && x.prop == key) || x.id == key);
			}
			this.logDebug(`setDeviceState -> states: ${JSON.stringify(states)}`);

			for (const state of states) {
				if (!state) {
					continue;
				}

				const stateName = `${device.ieee_address}.${state.id}`;

				try {
					if (state.getter) {
						await this.setStateAsync(stateName, state.getter(messageObj.payload), true);
					}
					else {
						await this.setStateAsync(stateName, value, true);
					}
				} catch (err) {
					this.log.warn(`Can not set ${stateName}`);
				}
			}
		}
	}

	async createDeviceDefinitions(cache, exposes) {
		clearArray(cache);
		for (const expose of exposes) {
			if (expose.definition != null) {
				// search for scenes in the endpoints and build them into an array
				let scenes = [];
				for (const key in expose.endpoints) {
					if (expose.endpoints[key].scenes) {
						scenes = scenes.concat(expose.endpoints[key].scenes);
					}
				}

				await defineDeviceFromExposes(cache, expose.friendly_name, expose.ieee_address, expose.definition, expose.power_source, scenes, useKelvin);
			}
		}
	}

	async createGroupDefinitions(cache, exposes) {
		clearArray(cache);
		for (const expose of exposes) {
			await defineGroupDevice(cache, expose.friendly_name, `group_${expose.id}`, expose.scenes, useKelvin);
		}
	}

	async createOrUpdateDevices(cache) {
		for (const device of cache) {
			const deviceName = device.id == device.ieee_address ? '' : device.id;
			if (!createCache[device.ieee_address] || createCache[device.ieee_address].common.name != deviceName) {
				const deviceObj = {
					type: 'device',
					common: {
						name: deviceName,
					},

					native: {}
				};

				if (!device.ieee_address.includes('group_')) {
					deviceObj.common.statusStates = {
						onlineId: `${this.name}.${this.instance}.${device.ieee_address}.available`
					};
				}

				//@ts-ignore
				await this.extendObjectAsync(device.ieee_address, deviceObj);
				createCache[device.ieee_address] = deviceObj;
			}

			// Here it is checked whether the scenes match the current data from z2m.
			// If necessary, scenes are automatically deleted from ioBroker.
			const sceneStates = await this.getStatesAsync(`${device.ieee_address}.scene_*`);
			const sceneIDs = Object.keys(sceneStates);
			for (const sceneID of sceneIDs) {
				const stateID = sceneID.split('.')[3];
				if (device.states.find(x => x.id == stateID) == null) {
					this.delObject(sceneID);
				}
			}

			for (const state of device.states) {
				if (!createCache[device.ieee_address][state.id] || createCache[device.ieee_address][state.id].name != state.name) {
					const iobState = await this.copyAndCleanStateObj(state);
					this.logDebug(`Orig. state: ${JSON.stringify(state)}`);
					this.logDebug(`Cleaned. state: ${JSON.stringify(iobState)}`);

					await this.extendObjectAsync(`${device.ieee_address}.${state.id}`, {
						type: 'state',
						common: iobState,
						native: {},
					});
					createCache[device.ieee_address][state.id] = state.name;
				}
			}
		}
	}

	async copyAndCleanStateObj(state) {
		const iobState = { ...state };
		const blacklistedKeys = [
			'setter',
			'setterOpt',
			'getter',
			'setattr',
			'readable',
			'writable',
			'isOption',
			'inOptions'
		];
		for (const blacklistedKey of blacklistedKeys) {
			delete iobState[blacklistedKey];
		}
		return iobState;
	}

	async subscribeWritableStates() {
		await this.unsubscribeObjectsAsync('*');

		for (const device of groupCache.concat(deviceCache)) {
			for (const state of device.states) {
				if (state.write == true) {
					this.subscribeStatesAsync(`${device.ieee_address}.${state.id}`);
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

		const device = groupCache.concat(deviceCache).find(d => d.ieee_address == ieee_address);

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
		// set stats with role 'button' always immediately to ack = true, because these are not reported back by Zigbee2MQTT
		if (deviceState.role == 'button') {
			this.setState(id, state, true);
		}

		return JSON.stringify(controlObj);
	}

	async proxyZ2MLogs(messageObj) {
		this.logDebug(`proxyZ2MLogs -> messageObj: ${JSON.stringify(messageObj)}`);

		const logMessage = messageObj.payload.message;
		if (logfilter.some(x => logMessage.includes(x))) {
			return;
		}

		const logLevel = messageObj.payload.level;
		switch (logLevel) {
			case 'debug':
			case 'info':
			case 'error':
				this.log[logLevel](logMessage);
				break;
			case 'warning':
				this.log.warn(logMessage);
				break;
		}
	}

	async logDebug(message) {
		if (debugLogEnabled == true) {
			this.log.debug(message);
		}
	}

	async setAllAvailableToFalse() {
		for (const device of deviceCache) {
			for (const state of device.states) {
				if (state.id == 'available') {
					await this.setStateAsync(`${device.ieee_address}.${state.id}`, false, true);
				}
			}
		}
	}

	async onUnload(callback) {
		try {
			await this.setAllAvailableToFalse();
			clearTimeout(ping);
			clearTimeout(pingTimeout);
			clearTimeout(autoRestartTimeout);
			clearTimeout(checkAvailableTimout);
			callback();
		} catch (e) {
			callback();
		}
	}

	async onStateChange(id, state) {
		if (state && state.ack == false) {
			const message = await this.createZ2MMessage(id, state);
			wsClient.send(message);

			if (id.includes('info.debugmessages')) {
				debugDevices = state.val;
				this.setState(id, state.val, true);
			}
			if (id.includes('info.logfilter')) {
				logfilter = state.val.split(';').filter(x => x); // filter removes empty strings here
				this.setState(id, state.val, true);
			}
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
