'use strict';

/*
 * Created with @iobroker/create-adapter v2.2.1
 */

// The adapter-core module gives you access to the core ioBroker functions
// you need to create an adapter
const core = require('@iobroker/adapter-core');
const NedbPersistence = require('aedes-persistence-nedb');
const mqtt = require('mqtt');
const checkConfig = require('./lib/check').checkConfig;
const adapterInfo = require('./lib/messages').adapterInfo;
const zigbee2mqttInfo = require('./lib/messages').zigbee2mqttInfo;
const Z2mController = require('./lib/z2mController').Z2mController;
const DeviceController = require('./lib/deviceController').DeviceController;
const StatesController = require('./lib/statesController').StatesController;


let mqttClient;
// eslint-disable-next-line prefer-const
let deviceCache = [];
// eslint-disable-next-line prefer-const
let groupCache = [];
let ping;
let pingTimeout;
let autoRestartTimeout;
let checkAvailableTimout;
let debugDevices = '';
let logfilter = [];
let showInfo = true;
let statesController;
let deviceController;
let z2mController;

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


		statesController = new StatesController(this, deviceCache, groupCache, debugDevices);
		deviceController = new DeviceController(this, deviceCache, groupCache, this.config.useKelvin);
		z2mController = new Z2mController(this, deviceCache, groupCache, logfilter);

		// Initialize your adapter here
		adapterInfo(this.config, this.log);

		this.setStateAsync('info.connection', false, true);

		const debugDevicesState = await this.getStateAsync('info.debugmessages');
		if (debugDevicesState && debugDevicesState.val) {
			debugDevices = String(debugDevicesState.val);
		}

		const logfilterState = await this.getStateAsync('info.logfilter');
		if (logfilterState && logfilterState.val) {
			logfilter = String(logfilterState.val).split(';').filter(x => x); // filter removes empty strings here
		}

		if (this.config.useExternalMqtt == true) {
			mqttClient = mqtt.connect(`mqtt://${this.config.externalMqttServerIP}:${this.config.externalMqttServerPort}`, { clientId: `ioBroker.zigbee2mqtt_${Math.random().toString(16).slice(2, 8)}`, clean: true, reconnectPeriod: 500 });
		} else {
			const Aedes = require('aedes');
			const net = require('net');
			const db = new NedbPersistence({
				path: `${core.getAbsoluteInstanceDataDir(this)}/mqttData`,
				prefix: ''
			});
			// @ts-ignore
			const aedes = Aedes({ persistence: db });
			const mqttServer = net.createServer(aedes.handle);
			mqttServer.listen(this.config.mqttServerPort, this.config.mqttServerIPBind, () => { });
			mqttClient = mqtt.connect(`mqtt://${this.config.mqttServerIPBind}:${this.config.mqttServerPort}`, { clientId: 'ioBroker.zigbee2mqtt', clean: true, reconnectPeriod: 500 });
		}

		mqttClient.on('connect', () => { this.setStateAsync('info.connection', true, true); });
		mqttClient.subscribe('#');
		mqttClient.on('message', (topic, payload) => {
			const newMessage = `{"payload":${payload.toString() == '' ? '"null"' : payload.toString()},"topic":"${topic.slice(topic.search('/') + 1)}"}`;
			console.log(newMessage);
			this.messageParse(newMessage);
		});
	}


	async messageParse(message) {
		const messageObj = JSON.parse(message);

		switch (messageObj.topic) {
			case 'bridge/config':
				break;
			case 'bridge/info':
				if (showInfo) {
					zigbee2mqttInfo(messageObj.payload, this.log);
					checkConfig(messageObj.payload.config, this.log);
					showInfo = false;
				}
				break;
			case 'bridge/state':
				break;
			case 'bridge/devices':
				await deviceController.createDeviceDefinitions(messageObj.payload);
				await deviceController.createOrUpdateDevices();
				await statesController.subscribeWritableStates();
				statesController.processQueue();
				break;
			case 'bridge/groups':
				await deviceController.createGroupDefinitions(messageObj.payload);
				await deviceController.createOrUpdateDevices();
				await statesController.subscribeWritableStates();
				statesController.processQueue();
				break;
			case 'bridge/event':
				deviceController.processRemoveEvent(messageObj);
				break;
			case 'bridge/extensions':
				break;
			case 'bridge/logging':
				if (this.config.proxyZ2MLogs == true) {
					z2mController.proxyZ2MLogs(messageObj);
				}
				break;
			case 'bridge/response/device/rename':
				await deviceController.renameDeviceInCache(messageObj);
				await deviceController.createOrUpdateDevices();
				statesController.processQueue();
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

						// If an availability message for an old device ID comes with a payload of NULL, this is the indicator that a device has been unnamed.
						// If this is then still available in the cache, the messages must first be cached.
						if (messageObj.payload == 'null') {
							break;
						}

						if (topicSplit.length == 2 && messageObj.payload && messageObj.payload.state) {
							const newMessage = {
								payload: { available: messageObj.payload.state == 'online' },
								topic: topicSplit[0]
							};
							statesController.processDeviceMessage(newMessage);
						}
						// States
					} else if (!messageObj.topic.includes('/')) {
						statesController.processDeviceMessage(messageObj);
					}
				}
				break;
		}
	}

	async onUnload(callback) {
		try {
			await statesController.setAllAvailableToFalse();
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
			if (id.includes('info.debugmessages')) {
				debugDevices = state.val;
				this.setState(id, state.val, true);
				return;
			}
			if (id.includes('info.logfilter')) {
				logfilter = state.val.split(';').filter(x => x); // filter removes empty strings here
				this.setState(id, state.val, true);
				return;
			}

			const message = await z2mController.createZ2MMessage(id, state) || { topic: '', payload: '' };
			mqttClient.publish('zigbee2mqtt/' + message.topic, JSON.stringify(message.payload));
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
