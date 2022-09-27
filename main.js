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
const deviceLastSeenCache = {};
let ping;
let pingTimeout;
let autoRestartTimeout;
const wsHeartbeatIntervall = 5000;
const restartTimeout = 1000;
const deviceAvailableTimeout = 10 * 60; // 10 Minutes
const batteryDeviceAvailableTimeout = 24 * 60 * 60; // 24 Hours
const checkAvailableInterval = 30 * 1000; // 10 Seconds
let debugLogEnabled;
let proxyZ2MLogsEnabled;
let checkAvailableTimout;

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

		this.setStateAsync('info.connection', false, true);
		this.createWsClient(this.config.server, this.config.port);

		debugLogEnabled = this.config.debugLogEnabled;
		proxyZ2MLogsEnabled = this.config.proxyZ2MLogs;
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
				// Start CheckAvailableTimer
				this.checkAvailableTimer();
			});
			wsClient.on('pong', () => {
				//this.logDebug('Receive pong from server');
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
		this.logDebug(`processDeviceMessage -> messageObj: ${JSON.stringify(messageObj)}`);
		// Is payload present?
		if (messageObj.payload == '') {
			return;
		}

		const device = deviceCache.find(x => x.id == messageObj.topic);
		if (device) {
			this.logDebug(`processDeviceMessage -> device: ${JSON.stringify(device)}`);
			try {
				// The state available must not be considered for the cacheLastSeen
				if (messageObj.payload.available == undefined) {
					await this.cacheLastSeen(device, messageObj);
				}
				this.setDeviceState(messageObj, device);
				this.checkAvailable(device.ieee_address);

			} catch (error) {
				adapter.log.error(error);
			}
		}
		else {
			adapter.log.warn(`Device: ${messageObj.topic} not found`);
		}
	}

	async cacheLastSeen(device, messageObj) {
		this.logDebug(`cacheLastSeen -> device: ${JSON.stringify(device)}`);
		this.logDebug(`cacheLastSeen -> messageObj: ${JSON.stringify(messageObj)}`);
		if (messageObj.payload.last_seen) {
			deviceLastSeenCache[device.ieee_address] = new Date(messageObj.payload.last_seen).getTime();
		} else {
			deviceLastSeenCache[device.ieee_address] = new Date().getTime();
		}
		this.logDebug(`cacheLastSeen -> deviceLastSeenCache: ${JSON.stringify(deviceLastSeenCache)}`);
	}

	async checkAvailableTimer() {
		checkAvailableTimout = setTimeout(async () => {
			await this.checkAvailable(null);
			this.checkAvailableTimer();
		}, checkAvailableInterval);
	}

	async checkAvailable(ieee_address) {
		this.logDebug(`checkAvailable -> ieee_address: ${ieee_address}`);
		let checkList = {};
		if (ieee_address) {
			checkList[ieee_address] = null;
		}
		else {
			checkList = deviceLastSeenCache;
		}

		for (const ieee_address in checkList) {
			const device = deviceCache.find(x => x.ieee_address == ieee_address);

			if (!device) {
				continue;
			}

			const isBatteryDevice = device.power_source == 'Battery' ? true : false;
			const offlineTimeout = isBatteryDevice ? batteryDeviceAvailableTimeout : deviceAvailableTimeout;
			const diffSec = Math.round((new Date().getTime() - deviceLastSeenCache[ieee_address]) / 1000);
			const available = diffSec < offlineTimeout;

			this.logDebug(`checkAvailable -> device.id: ${device.id}, available: ${available}, diffSec: ${diffSec}, isBatteryDevice: ${isBatteryDevice}`);

			if (device.available == null || device.available != available) {
				this.logDebug(`checkAvailable -> device.id: ${device.id}, available: ${available}, diffSec: ${diffSec}, isBatteryDevice: ${isBatteryDevice}`);
				device.available = available;
				const messageObj = {
					topic: device.id,
					payload: {
						available: available,
					}
				};

				this.processDeviceMessage(messageObj);
			}
		}
	}

	async setDeviceState(messageObj, device) {

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
		this.logDebug(`createDevicesOrGroups -> messageObj: ${JSON.stringify(messageObj)}`);
		for (const expose of messageObj.payload) {
			if (messageObj.topic == 'bridge/devices') {
				if (expose.definition != null) {
					applyExposes(deviceCache, expose.friendly_name, expose.ieee_address, expose.definition, expose.power_source);
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
					type: 'device',
					common: {
						name: deviceName,
						statusStates: {
							onlineId: `${this.name}.${this.instance}.${device.ieee_address}.available`
						},
					},

					native: {}
				};
				//@ts-ignore
				await this.extendObjectAsync(device.ieee_address, deviceObj);
				deviceCreateCache[device.ieee_address] = deviceObj;
			}

			for (const state of device.states) {
				if (!deviceCreateCache[device.ieee_address][state.id]) {
					const iobState = await this.copyAndCleanStateObj(state);
					this.logDebug(`Orig. state: ${JSON.stringify(state)}`);
					this.logDebug(`Cleaned. state: ${JSON.stringify(iobState)}`);

					await this.extendObjectAsync(`${device.ieee_address}.${state.id}`, {
						type: 'state',
						common: iobState,
						native: {},
					});
					deviceCreateCache[device.ieee_address][state.id] = {};
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

	async proxyZ2MLogs(messageObj) {
		this.logDebug(`proxyZ2MLogs -> messageObj: ${JSON.stringify(messageObj)}`);

		const logLevel = messageObj.payload.level;
		const logMessage = messageObj.payload.message;

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

	onUnload(callback) {
		try {
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
