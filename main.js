'use strict';

/*
 * Created with @iobroker/create-adapter v2.2.1
 */

// The adapter-core module gives you access to the core ioBroker functions
// you need to create an adapter
const core = require('@iobroker/adapter-core');
const mqtt = require('mqtt');
const checkConfig = require('./lib/check').checkConfig;
const adapterInfo = require('./lib/messages').adapterInfo;
const zigbee2mqttInfo = require('./lib/messages').zigbee2mqttInfo;
const Z2mController = require('./lib/z2mController').Z2mController;
const DeviceController = require('./lib/deviceController').DeviceController;
const StatesController = require('./lib/statesController').StatesController;
const WebsocketController = require('./lib/websocketController').WebsocketController;
const MqttServerController = require('./lib/mqttServerController').MqttServerController;


let mqttClient;
// eslint-disable-next-line prefer-const
let deviceCache = [];
// eslint-disable-next-line prefer-const
let groupCache = [];
const logCustomizations = { debugDevices: '', logfilter: [] };
let showInfo = true;
let statesController;
let deviceController;
let z2mController;
let websocketController;
let mqttServerController;

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
		statesController = new StatesController(this, deviceCache, groupCache, logCustomizations);
		deviceController = new DeviceController(this, deviceCache, groupCache, this.config);
		z2mController = new Z2mController(this, deviceCache, groupCache, logCustomizations);

		// Initialize your adapter here
		adapterInfo(this.config, this.log);

		this.setStateAsync('info.connection', false, true);

		const debugDevicesState = await this.getStateAsync('info.debugmessages');
		if (debugDevicesState && debugDevicesState.val) {
			logCustomizations.debugDevices = String(debugDevicesState.val);
		}

		const logfilterState = await this.getStateAsync('info.logfilter');
		if (logfilterState && logfilterState.val) {
			// @ts-ignore
			logCustomizations.logfilter = String(logfilterState.val).split(';').filter(x => x); // filter removes empty strings here
		}
		// MQTT
		if (['exmqtt', 'intmqtt'].includes(this.config.connectionType)) {
			// External MQTT-Server
			if (this.config.connectionType == 'exmqtt') {
				if (this.config.externalMqttServerIP == '') {
					this.log.warn('Please configure the External MQTT-Server connection!');
					return;
				}
				mqttClient = mqtt.connect(`mqtt://${this.config.externalMqttServerIP}:${this.config.externalMqttServerPort}`, { clientId: `ioBroker.zigbee2mqtt_${Math.random().toString(16).slice(2, 8)}`, clean: true, reconnectPeriod: 500 });

			}
			// Internal MQTT-Server
			else {
				mqttServerController = new MqttServerController(this);
				await mqttServerController.createMQTTServer();
				await this.delay(1500);
				mqttClient = mqtt.connect(`mqtt://${this.config.mqttServerIPBind}:${this.config.mqttServerPort}`, { clientId: `ioBroker.zigbee2mqtt_${Math.random().toString(16).slice(2, 8)}`, clean: true, reconnectPeriod: 500 });
			}

			// MQTT Client
			mqttClient.on('connect', () => {
				this.log.info(`Connect to Zigbee2MQTT over ${this.config.connectionType == 'exmqtt' ? 'external mqtt' : 'internal mqtt'} connection.`);
			});

			mqttClient.subscribe('zigbee2mqtt/#');

			mqttClient.on('message', (topic, payload) => {
				const newMessage = `{"payload":${payload.toString() == '' ? '"null"' : payload.toString()},"topic":"${topic.slice(topic.search('/') + 1)}"}`;
				this.messageParse(newMessage);
			});
		}
		// Websocket
		else if (this.config.connectionType == 'ws') {
			if (this.config.wsServerIP == '') {
				this.log.warn('Please configure the Websoket connection!');
				return;
			}

			// Dummy MQTT-Server
			if (this.config.dummyMqtt == true) {
				mqttServerController = new MqttServerController(this);
				await mqttServerController.createDummyMQTTServer();
				await this.delay(1500);
			}

			this.startWebsocket();
		}
	}

	startWebsocket() {
		websocketController = new WebsocketController(this);
		const wsClient = websocketController.initWsClient();

		wsClient.on('open', () => {
			this.log.info('Connect to Zigbee2MQTT over websocket connection.');
		});

		wsClient.on('message', (message) => {
			this.messageParse(message);
		});

		wsClient.on('close', async () => {
			this.setStateChangedAsync('info.connection', false, true);
			await statesController.setAllAvailableToFalse();
			this.log.warn('Websocket disconnectet');
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
				if (messageObj.payload.state != 'online') {
					statesController.setAllAvailableToFalse();
				}
				this.setStateChangedAsync('info.connection', messageObj.payload.state == 'online', true);
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
				console.log(JSON.stringify(messageObj));
				deviceController.processRemoveEvent(messageObj);
				break;
			case 'bridge/response/device/remove':
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
			await websocketController.allTimerClear();
			await statesController.allTimerClear();
			callback();
		} catch (e) {
			callback();
		}
	}

	async onStateChange(id, state) {
		if (state && state.ack == false) {
			if (id.includes('info.debugmessages')) {
				logCustomizations.debugDevices = state.val;
				this.setState(id, state.val, true);
				return;
			}
			if (id.includes('info.logfilter')) {
				logCustomizations.logfilter = state.val.split(';').filter(x => x); // filter removes empty strings here
				this.setState(id, state.val, true);
				return;
			}

			const message = await z2mController.createZ2MMessage(id, state) || { topic: '', payload: '' };

			if (['exmqtt', 'intmqtt'].includes(this.config.connectionType)) {
				mqttClient.publish(`zigbee2mqtt/${message.topic}`, JSON.stringify(message.payload));
			} else if (this.config.connectionType == 'ws') {
				websocketController.send(JSON.stringify(message));
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