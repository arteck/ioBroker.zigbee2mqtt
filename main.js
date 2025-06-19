'use strict';
/*
 * Created with @iobroker/create-adapter v2.2.1
 */

// The adapter-core module gives you access to the core ioBroker functions
// you need to create an adapter
const core = require('@iobroker/adapter-core');
const mqtt = require('mqtt');
const utils = require('./lib/utils');
const schedule = require('node-schedule');
const checkConfig = require('./lib/check').checkConfig;
const adapterInfo = require('./lib/messages').adapterInfo;
const zigbee2mqttInfo = require('./lib/messages').zigbee2mqttInfo;
const Z2mController = require('./lib/z2mController').Z2mController;
const DeviceController = require('./lib/deviceController').DeviceController;
const StatesController = require('./lib/statesController').StatesController;
const WebsocketController = require('./lib/websocketController').WebsocketController;
const MqttServerController = require('./lib/mqttServerController').MqttServerController;

let mqttClient;

let deviceCache = [];

let groupCache = [];
const createCache = {};
const logCustomizations = { debugDevices: '', logfilter: [] };
let showInfo = true;
let statesController;
let deviceController;
let z2mController;
let websocketController;
let mqttServerController;

let messageParseMutex = Promise.resolve();

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
        statesController = new StatesController(this, deviceCache, groupCache, logCustomizations, createCache);
        deviceController = new DeviceController(
            this,
            deviceCache,
            groupCache,
            this.config,
            logCustomizations,
            createCache
        );
        z2mController = new Z2mController(this, deviceCache, groupCache, logCustomizations);

        // Initialize your adapter here
        adapterInfo(this.config, this.log);

        this.setState('info.connection', false, true);

        const debugDevicesState = await this.getStateAsync('info.debugmessages');
        if (debugDevicesState && debugDevicesState.val) {
            logCustomizations.debugDevices = String(debugDevicesState.val);
        }

        const logfilterState = await this.getStateAsync('info.logfilter');
        if (logfilterState && logfilterState.val) {
            // @ts-ignore
            logCustomizations.logfilter = String(logfilterState.val)
                .split(';')
                .filter((x) => x); // filter removes empty strings here
        }

        if (this.config.coordinatorCheck == true) {
            try {
                schedule.scheduleJob('coordinatorCheck', this.config.coordinatorCheckCron, () =>
                    this.onStateChange('manual_trigger._.info.coordinator_check', { ack: false })
                );
            } catch (e) {
                this.log.error(e);
            }
        }
        // MQTT
        if (['exmqtt', 'intmqtt'].includes(this.config.connectionType)) {
            // External MQTT-Server
            if (this.config.connectionType == 'exmqtt') {
                if (this.config.externalMqttServerIP == '') {
                    this.log.warn('Please configure the External MQTT-Server connection!');
                    return;
                }

                // MQTT connection settings
                const mqttClientOptions = {
                    clientId: `ioBroker.zigbee2mqtt_${Math.random().toString(16).slice(2, 8)}`,
                    clean: true,
                    reconnectPeriod: 500,
                };

                // Set external mqtt credentials
                if (this.config.externalMqttServerCredentials == true) {
                    mqttClientOptions.username = this.config.externalMqttServerUsername;
                    mqttClientOptions.password = this.config.externalMqttServerPassword;
                }

                // Init connection
                mqttClient = mqtt.connect(
                    `mqtt://${this.config.externalMqttServerIP}:${this.config.externalMqttServerPort}`,
                    mqttClientOptions
                );
            }
            // Internal MQTT-Server
            else {
                mqttServerController = new MqttServerController(this);
                await mqttServerController.createMQTTServer();
                await this.delay(1500);
                mqttClient = mqtt.connect(`mqtt://${this.config.mqttServerIPBind}:${this.config.mqttServerPort}`, {
                    clientId: `ioBroker.zigbee2mqtt_${Math.random().toString(16).slice(2, 8)}`,
                    clean: true,
                    reconnectPeriod: 500,
                });
            }

            // MQTT Client
            mqttClient.on('connect', () => {
                this.log.info(
                    `Connect to Zigbee2MQTT over ${this.config.connectionType == 'exmqtt' ? 'external mqtt' : 'internal mqtt'} connection.`
                );
            });

            mqttClient.subscribe(`${this.config.baseTopic}/#`);

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

        if (wsClient) {
            wsClient.on('open', () => {
                this.log.info('Connect to Zigbee2MQTT over websocket connection.');
            });

            wsClient.on('message', (message) => {
                this.messageParse(message);
            });

            wsClient.on('close', async () => {
                this.setStateChanged('info.connection', false, true);
                await statesController.setAllAvailableToFalse();
                deviceCache = [];
                groupCache = [];
            });
        }
    }

    async messageParse(message) {
        // Mutex lock: queue up calls to messageParse
        let release;
        const lock = new Promise((resolve) => (release = resolve));
        const prev = messageParseMutex;
        messageParseMutex = lock;
        await prev;
        try {
            // If the MQTT output type is set to attribute_and_json, the non-valid JSON must be checked here.
            if (utils.isJson(message) == false) {
                return;
            }

            const messageObj = JSON.parse(message);

            switch (messageObj.topic) {
                case 'bridge/config':
                    break;
                case 'bridge/info':
                    if (showInfo) {
                        zigbee2mqttInfo(messageObj.payload, this.log);
                        checkConfig(messageObj.payload.config, this.log, messageObj.payload.version);
                        showInfo = false;
                    }
                    break;
                case 'bridge/state':
                    if (messageObj.payload.state != 'online') {
                        statesController.setAllAvailableToFalse();
                    }
                    this.setStateChanged('info.connection', messageObj.payload.state == 'online', true);
                    break;
                case 'bridge/devices':
                    await deviceController.createDeviceDefinitions(messageObj.payload);
                    await deviceController.createOrUpdateDevices();
                    await deviceController.checkAndProgressDeviceRemove();
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
                    break;
                case 'bridge/response/coordinator_check':
                    deviceController.processCoordinatorCheck(messageObj.payload);
                    break;
                case 'bridge/response/device/remove':
                    break;
                case 'bridge/response/device/options':
                    break;
                case 'bridge/response/permit_join':
                    break;
                case 'bridge/extensions':
                    break;
                case 'bridge/logging':
                    if (this.config.proxyZ2MLogs == true) {
                        z2mController.proxyZ2MLogs(messageObj);
                    }
                    break;
                case 'bridge/response/device/configure':
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
                        // is the payload an availability status?
                        if (messageObj.topic.endsWith('/availability')) {
                            // If an availability message for an old device ID comes with a payload of NULL, this is the indicator that a device has been unnamed.
                            if (messageObj.payload == 'null') {
                                return;
                            }
                            // is it a viable payload?
                            if (messageObj.payload && messageObj.payload.state) {
                                // {"payload":{"state":"online"},"topic":"FL.Licht.Links/availability"}  ---->  {"payload":{"available":true},"topic":"FL.Licht.Links"}
                                const newMessage = {
                                    payload: { available: messageObj.payload.state == 'online' },
                                    topic: messageObj.topic.replace('/availability', ''),
                                };

                                statesController.processDeviceMessage(newMessage);
                            }
                            // States
                        } else {
                            // With the MQTT output type attribute_and_json, primitive payloads arrive here that must be discarded.
                            if (utils.isObject(messageObj.payload) == false) {
                                return;
                            }
                            // If MQTT is used, I have to filter the self-sent 'set' commands.
                            if (messageObj.topic.endsWith('/set')) {
                                return;
                            }

                            statesController.processDeviceMessage(messageObj);
                        }
                    }
                    break;
            }
        } finally {
            release();
        }
    }

    async onUnload(callback) {
        // Close MQTT connections
        if (['exmqtt', 'intmqtt'].includes(this.config.connectionType)) {
            if (mqttClient && !mqttClient.closed) {
                try {
                    if (mqttClient) {
                        mqttClient.end();
                    }
                } catch (e) {
                    this.log.error(e);
                }
            }
        }
        // Internal or Dummy MQTT-Server
        if (this.config.connectionType == 'intmqtt' || this.config.dummyMqtt == true) {
            try {
                if (mqttServerController) {
                    mqttServerController.closeServer();
                }
            } catch (e) {
                this.log.error(e);
            }
        }
        // Websocket
        else if (this.config.connectionType == 'ws') {
            try {
                if (websocketController) {
                    websocketController.closeConnection();
                }
            } catch (e) {
                this.log.error(e);
            }
        }
        // Set all device available states of false
        try {
            if (statesController) {
                await statesController.setAllAvailableToFalse();
            }
        } catch (e) {
            this.log.error(e);
        }
        // Clear all websocket timers
        try {
            if (websocketController) {
                await websocketController.allTimerClear();
            }
        } catch (e) {
            this.log.error(e);
        }
        // Clear all state timers
        try {
            if (statesController) {
                await statesController.allTimerClear();
            }
        } catch (e) {
            this.log.error(e);
        }

        callback();
    }

    async onStateChange(id, state) {
        if (state && state.ack == false) {
            if (id.endsWith('info.debugmessages')) {
                logCustomizations.debugDevices = state.val;
                this.setState(id, state.val, true);
                return;
            }
            if (id.endsWith('info.logfilter')) {
                logCustomizations.logfilter = state.val.split(';').filter((x) => x); // filter removes empty strings here
                this.setState(id, state.val, true);
                return;
            }

            const message = (await z2mController.createZ2MMessage(id, state)) || { topic: '', payload: '' };

            if (['exmqtt', 'intmqtt'].includes(this.config.connectionType)) {
                mqttClient.publish(`${this.config.baseTopic}/${message.topic}`, JSON.stringify(message.payload));
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
