'use strict';

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

class Zigbee2mqtt extends core.Adapter {
    /**
     * Erstellt eine neue Instanz des Zigbee2MQTT-Adapters.
     *
     * @param {object} [options] Optionale Adapter-Konfiguration (AdapterOptions)
     */
    constructor(options) {
        super({
            ...options,
            name: 'zigbee2mqtt',
        });

        // Instance-level state (kein Modul-globaler Zustand)
        this.mqttClient = null;
        this.deviceCache = [];
        this.groupCache = [];
        this.createCache = {};
        this.logCustomizations = { debugDevices: '', logfilter: [] };
        this.showInfo = true;
        this.statesController = null;
        this.deviceController = null;
        this.z2mController = null;
        this.websocketController = null;
        this.mqttServerController = null;
        this.messageParseMutex = Promise.resolve();

        this.on('ready', () => {
            this.onReady().catch((e) => this.log.error(`onReady error: ${e}`));
        });
        this.on('stateChange', (id, state) => {
            this.onStateChange(id, state).catch((e) => this.log.error(`onStateChange error: ${e}`));
        });
        this.on('message', (obj) => {
            this.onMessage(obj).catch((e) => this.log.error(`onMessage error: ${e}`));
        });
        this.on('unload', this.onUnload.bind(this));
    }

    /**
     * Wird aufgerufen sobald der Adapter bereit ist (alle Objekte initialisiert).
     * Initialisiert alle Controller und baut die Verbindung zu Zigbee2MQTT auf.
     */
    async onReady() {
        this.statesController = new StatesController(this, this.deviceCache, this.groupCache, this.logCustomizations, this.createCache);
        this.deviceController = new DeviceController(
            this,
            this.deviceCache,
            this.groupCache,
            this.config,
            this.logCustomizations,
            this.createCache
        );
        this.z2mController = new Z2mController(this, this.deviceCache, this.groupCache, this.logCustomizations);

        adapterInfo(this.config, this.log);

        await this.setStateAsync('info.connection', false, true);

        const debugDevicesState = await this.getStateAsync('info.debugmessages');
        if (debugDevicesState && debugDevicesState.val) {
            this.logCustomizations.debugDevices = String(debugDevicesState.val);
        }

        const logfilterState = await this.getStateAsync('info.logfilter');
        if (logfilterState && logfilterState.val) {
            this.logCustomizations.logfilter = String(logfilterState.val)
                .split(';')
                .filter((x) => x);
        }

        if (this.config.coordinatorCheck === true) {
            try {
                schedule.scheduleJob('coordinatorCheck', this.config.coordinatorCheckCron, () => {
                    this.onStateChange('manual_trigger._.info.coordinator_check', { ack: false, val: null })
                        .catch((e) => this.log.error(`coordinatorCheck trigger error: ${e}`));
                });
            } catch (e) {
                this.log.error(e);
            }
        }

        // MQTT
        if (['exmqtt', 'intmqtt'].includes(this.config.connectionType)) {
            // External MQTT-Server
            if (this.config.connectionType === 'exmqtt') {
                if (!this.config.externalMqttServerIP) {
                    this.log.warn('Please configure the External MQTT-Server connection!');
                    return;
                }

                const mqttClientOptions = {
                    clientId: `ioBroker.zigbee2mqtt_${Math.random().toString(16).slice(2, 8)}`,
                    clean: true,
                    reconnectPeriod: 500,
                    connectTimeout: 10000,
                };

                if (this.config.externalMqttServerCredentials === true) {
                    mqttClientOptions.username = this.config.externalMqttServerUsername;
                    mqttClientOptions.password = this.config.externalMqttServerPassword;
                }

                this.mqttClient = mqtt.connect(
                    `mqtt://${this.config.externalMqttServerIP}:${this.config.externalMqttServerPort}`,
                    mqttClientOptions
                );
            } else {
                // Internal MQTT-Server
                this.mqttServerController = new MqttServerController(this);
                await this.mqttServerController.createMQTTServer();
                // Kurze Pause damit der OS-Socket tatsächlich bereit ist (createMQTTServer wartet bereits auf listen)
                await this.delay(200);
                this.mqttClient = mqtt.connect(`mqtt://${this.config.mqttServerIPBind}:${this.config.mqttServerPort}`, {
                    clientId: `ioBroker.zigbee2mqtt_${Math.random().toString(16).slice(2, 8)}`,
                    clean: true,
                    reconnectPeriod: 500,
                    connectTimeout: 10000,
                });
            }

            // MQTT Client Events
            this.mqttClient.on('connect', () => {
                this.log.info(
                    `Connect to Zigbee2MQTT over ${this.config.connectionType === 'exmqtt' ? 'external mqtt' : 'internal mqtt'} connection.`
                );
                this.setStateChangedAsync('info.connection', true, true).catch((e) =>
                    this.log.error(`MQTT connect setStateChangedAsync error: ${e}`)
                );
                if (!this.config.baseTopic) {
                    this.log.error('baseTopic is not configured – cannot subscribe to MQTT topics!');
                    return;
                }
                this.mqttClient.subscribe(`${this.config.baseTopic}/#`, (err) => {
                    if (err) {
                        this.log.error(`MQTT subscribe error: ${err && err.message ? err.message : String(err)}`);
                    }
                });
            });

            this.mqttClient.on('reconnect', () => {
                this.log.info('MQTT client reconnecting to Zigbee2MQTT...');
            });

            this.mqttClient.on('offline', async () => {
                this.log.warn('MQTT client offline – connection to Zigbee2MQTT lost.');
                await this.setStateChangedAsync('info.connection', false, true).catch((e) =>
                    this.log.error(`MQTT offline setStateChangedAsync error: ${e}`)
                );
                try {
                    if (this.statesController) {
                        await this.statesController.setAllAvailableToFalse();
                    }
                } catch (e) {
                    this.log.error(`MQTT offline setAllAvailableToFalse error: ${e}`);
                }
            });

            this.mqttClient.on('close', async () => {
                this.log.debug('MQTT client connection closed.');
                await this.setStateChangedAsync('info.connection', false, true).catch((e) =>
                    this.log.error(`MQTT close setStateChangedAsync error: ${e}`)
                );
            });

            this.mqttClient.on('error', (err) => {
                this.log.error(`MQTT client error: ${err && err.message ? err.message : String(err)}`);
            });

            this.mqttClient.on('message', (topic, payload) => {
                // baseTopic-Prefix vollständig entfernen – funktioniert auch bei mehrstufigem baseTopic (z.B. home/zigbee2mqtt)
                const basePrefix = this.config.baseTopic ? `${this.config.baseTopic}/` : null;
                if (!basePrefix || !topic.startsWith(basePrefix)) {
                    this.log.debug(`MQTT message with unexpected topic format: ${topic}`);
                    return;
                }
                const payloadStr = payload.toString();
                let parsedPayload;
                try {
                    parsedPayload = payloadStr === '' ? null : JSON.parse(payloadStr);
                } catch {
                    parsedPayload = payloadStr;
                }
                const messageObj = {
                    payload: parsedPayload,
                    topic: topic.slice(basePrefix.length),
                };
                this.messageParse(messageObj).catch((err) => {
                    this.log.error(`messageParse error: ${err}`);
                });
            });
        } else if (this.config.connectionType === 'ws') {
            // Websocket
            if (!this.config.wsServerIP) {
                this.log.warn('Please configure the Websoket connection!');
                return;
            }

            if (this.config.dummyMqtt === true) {
                this.mqttServerController = new MqttServerController(this);
                await this.mqttServerController.createDummyMQTTServer();
                await this.delay(200);
            }

            this.startWebsocket();
        }
    }

    /**
     * Erstellt (einmalig) den WebsocketController und initiiert die WS-Verbindung.
     * Wird beim Start und nach einem Verbindungsabbruch aufgerufen.
     */
    startWebsocket() {
        // Controller nur einmal erstellen – bei Reconnect wird derselbe wiederverwendet
        if (!this.websocketController) {
            this.websocketController = new WebsocketController(this);
        }
        this.websocketController.initWsClient();
    }

    /**
     * Parst eine eingehende MQTT- oder WebSocket-Nachricht von Zigbee2MQTT
     * und leitet sie an den zuständigen Controller weiter.
     * Alle Aufrufe werden serialisiert (Mutex), um Race-Conditions zu vermeiden.
     *
     * @param {{ topic: string, payload: any }} messageObj Die zu verarbeitende Nachricht
     */
    async messageParse(messageObj) {
        // Mutex: serialisiert alle messageParse-Aufrufe
        // Wichtig: lock muss IMMER wieder freigegeben werden, auch bei early return / Fehler.
        let release = () => {};
        const lock = new Promise((resolve) => (release = resolve));
        const prev = this.messageParseMutex;
        this.messageParseMutex = lock;

        // Wenn prev rejected hat, wollen wir trotzdem weiterarbeiten (sonst blockiert alles)
        try {
            await prev;
        } catch {
            // ignore
        }

        try {
            if (!messageObj || typeof messageObj !== 'object') {
                return;
            }
            if (!this.statesController || !this.deviceController || !this.z2mController) {
                this.log.debug('messageParse: controllers not yet initialized, dropping message.');
                return;
            }

            switch (messageObj.topic) {
                case 'Coordinator/availability': {
                    const coordState = typeof messageObj.payload === 'object' && messageObj.payload !== null
                        ? messageObj.payload.state
                        : messageObj.payload;
                    await this.setStateChangedAsync('info.coordinator_status', coordState, true);
                    break;
                }
                case 'bridge/info':
                    if (this.showInfo && messageObj.payload) {
                        await zigbee2mqttInfo(messageObj.payload, this.log);
                        if (messageObj.payload.config && messageObj.payload.version) {
                            checkConfig(messageObj.payload.config, this.log, messageObj.payload.version);
                        }
                        this.showInfo = false;
                    }
                    break;
                case 'bridge/state': {
                    const bridgeState = typeof messageObj.payload === 'object' && messageObj.payload !== null
                        ? messageObj.payload.state
                        : messageObj.payload;
                    if (bridgeState !== 'online') {
                        await this.statesController.setAllAvailableToFalse();
                        this.showInfo = true;
                    }
                    await this.setStateChangedAsync('info.connection', bridgeState === 'online', true);
                    break;
                }
                case 'bridge/devices':
                    await this.deviceController.createDeviceDefinitions(messageObj.payload);
                    await this.deviceController.createOrUpdateDevices();
                    await this.deviceController.checkAndProgressDeviceRemove();
                    await this.statesController.subscribeWritableStates();
                    await this.statesController.processQueue();
                    break;
                case 'bridge/groups':
                    await this.deviceController.createGroupDefinitions(messageObj.payload);
                    await this.deviceController.createOrUpdateDevices();
                    await this.statesController.subscribeWritableStates();
                    await this.statesController.processQueue();
                    break;
                case 'bridge/response/coordinator_check':
                    await this.deviceController.processCoordinatorCheck(messageObj.payload);
                    break;
                case 'bridge/logging':
                    if (this.config.proxyZ2MLogs === true) {
                        await this.z2mController.proxyZ2MLogs(messageObj);
                    }
                    break;
                case 'bridge/response/device/rename':
                    await this.deviceController.renameDeviceInCache(messageObj);
                    await this.deviceController.createOrUpdateDevices();
                    await this.statesController.processQueue();
                    break;
                case 'bridge/event': {
                    const evType = messageObj.payload && messageObj.payload.type;
                    const evData = messageObj.payload && messageObj.payload.data;
                    if (evType === 'device_announce' && evData && evData.friendly_name) {
                        const newMessage = { payload: { available: true }, topic: evData.friendly_name };
                        await this.statesController.processDeviceMessage(newMessage);
                    } else if (evType === 'device_leave' && evData && evData.friendly_name) {
                        const newMessage = { payload: { available: false }, topic: evData.friendly_name };
                        await this.statesController.processDeviceMessage(newMessage);
                    }
                    break;
                }
                case 'bridge/config':
                case 'bridge/health':
                case 'bridge/definitions':
                case 'bridge/extensions':
                case 'bridge/response/device/configure':
                case 'bridge/response/device/remove':
                case 'bridge/response/device/options':
                case 'bridge/response/device/interview':
                case 'bridge/response/permit_join':
                case 'bridge/response/networkmap':
                case 'bridge/response/options':
                case 'bridge/response/restart':
                case 'bridge/response/backup':
                case 'bridge/response/install_code/add':
                case 'bridge/response/group/add':
                case 'bridge/response/group/remove':
                case 'bridge/response/group/members/add':
                case 'bridge/response/group/members/remove':
                case 'bridge/response/touchlink/scan':
                case 'bridge/response/touchlink/identify':
                case 'bridge/response/touchlink/factory_reset':
                    break;
                default: {
                    if (!messageObj.topic || typeof messageObj.topic !== 'string') {
                        break;
                    }
                    if (messageObj.topic.endsWith('/availability')) {
                        if (messageObj.payload === null || messageObj.payload === undefined) {
                            break;
                        }
                        const deviceTopic = messageObj.topic.replace('/availability', '');
                        if (!deviceTopic) {
                            break;
                        }
                        const availState = typeof messageObj.payload === 'object'
                            ? messageObj.payload.state
                            : messageObj.payload;
                        const newMessage = {
                            payload: { available: availState === 'online' },
                            topic: deviceTopic,
                        };
                        await this.statesController.processDeviceMessage(newMessage);
                    } else {
                        if (!utils.isObject(messageObj.payload)) {
                            break;
                        }
                        if (messageObj.topic.endsWith('/set')) {
                            break;
                        }
                        await this.statesController.processDeviceMessage(messageObj);
                    }
                    break;
                }
            }
        } finally {
            // Mutex immer freigeben
            release();
        }
    }

    /**
     * Verarbeitet interne ioBroker-Nachrichten (z.B. Admin-UI-Kommandos).
     *
     * @param {ioBroker.Message} obj Das eingehende Nachrichtenobjekt
     */
    async onMessage(obj) {
        if (!obj || !obj.command) {
            return;
        }

        if (obj.command === 'deleteOldStates') {
            const deletedList = [];
            const errorList  = [];
            try {
                // Guard: Caches müssen gefüllt sein – sonst würden ALLE States gelöscht
                if (this.deviceCache.length === 0 && this.groupCache.length === 0) {
                    const warn = 'deleteOldStates: device list is empty – adapter not connected to Zigbee2MQTT yet. Aborting.';
                    this.log.warn(warn);
                    if (obj.callback) {
                        this.sendTo(obj.from, obj.command, { error: warn }, obj.callback);
                    }
                    return;
                }

                // Nur echte Geräte (kein group_*) – Gruppen werden beim Löschen komplett ausgelassen
                const knownStateIDs = new Set();
                for (const device of this.deviceCache) {
                    if (!device || !device.ieee_address || !Array.isArray(device.states)) {
                        continue;
                    }
                    const base = `${this.namespace}.${device.ieee_address}`;
                    for (const state of device.states) {
                        if (state && state.id) {
                            knownStateIDs.add(`${base}.${state.id}`);
                        }
                    }
                    // additional-Channel und Pflicht-States immer erlauben
                    knownStateIDs.add(`${base}.additional`);
                    knownStateIDs.add(`${base}.available`);
                    knownStateIDs.add(`${base}.last_seen`);
                    knownStateIDs.add(`${base}.send_payload`);
                }

                // Alle vorhandenen Adapter-Objekte laden
                const allObjects = await this.getAdapterObjectsAsync();
                if (!allObjects) {
                    const warn = 'deleteOldStates: getAdapterObjectsAsync returned null – aborting.';
                    this.log.error(warn);
                    if (obj.callback) {
                        this.sendTo(obj.from, obj.command, { error: warn }, obj.callback);
                    }
                    return;
                }
                for (const id of Object.keys(allObjects)) {
                    const iobObj = allObjects[id];

                    // Nur States löschen – keine channels, devices, folders
                    if (!iobObj || iobObj.type !== 'state') {
                        continue;
                    }

                    // info.* States niemals löschen
                    if (id.includes('.info.')) {
                        continue;
                    }

                    // Gruppen-States (group_*) niemals löschen
                    // Format: adapter.instance.ieee_address.stateid → parts[2] ist ieee_address
                    const parts = id.split('.');
                    if (parts.length >= 3 && parts[2].startsWith('group_')) {
                        continue;
                    }

                    // additional.* Sub-States erlauben
                    if (parts.length >= 5) {
                        const additionalBase = parts.slice(0, 4).join('.');
                        if (knownStateIDs.has(additionalBase)) {
                            continue;
                        }
                    }

                    // Wenn nicht im bekannten Set → löschen
                    if (!knownStateIDs.has(id)) {
                        try {
                            await this.delObjectAsync(id);
                            deletedList.push(id);
                            this.log.debug(`deleteOldStates: deleted ${id}`);
                        } catch (e) {
                            errorList.push(id);
                            this.log.warn(`deleteOldStates: could not delete ${id}: ${e}`);
                        }
                    }
                }

                // Liste aller gelöschten States als Warning ausgeben
                if (deletedList.length > 0) {
                    this.log.warn(`deleteOldStates: deleted ${deletedList.length} state(s):`);
                    for (const deletedId of deletedList) {
                        this.log.warn(`  - ${deletedId}`);
                    }
                }
                if (errorList.length > 0) {
                    this.log.warn(`deleteOldStates: failed to delete ${errorList.length} state(s):`);
                    for (const errId of errorList) {
                        this.log.warn(`  - ${errId}`);
                    }
                }

                const msg = `Deleted ${deletedList.length} old state(s)${errorList.length > 0 ? `, ${errorList.length} error(s)` : ''}.`;
                this.log.info(`deleteOldStates: ${msg}`);
                if (obj.callback) {
                    this.sendTo(obj.from, obj.command, { result: msg }, obj.callback);
                }
            } catch (e) {
                this.log.error(`deleteOldStates error: ${e}`);
                if (obj.callback) {
                    this.sendTo(obj.from, obj.command, { error: String(e) }, obj.callback);
                }
            }
        }
    }

    /**
     * Wird beim Stoppen des Adapters aufgerufen.
     * Trennt alle Verbindungen, stoppt Timer und ruft abschließend callback() auf.
     *
     * @param {() => void} callback Muss am Ende zwingend aufgerufen werden
     */
    async onUnload(callback) {
        try {
            if (['exmqtt', 'intmqtt'].includes(this.config.connectionType)) {
                if (this.mqttClient && this.mqttClient.connected) {
                    try {
                        this.mqttClient.removeAllListeners();
                        this.mqttClient.end(true);
                    } catch (e) {
                        this.log.error(e);
                    }
                }
            }
            if (this.config.connectionType === 'intmqtt' || this.config.dummyMqtt === true) {
                try {
                    if (this.mqttServerController) {
                        this.mqttServerController.closeServer();
                    }
                } catch (e) {
                    this.log.error(e);
                }
            } else if (this.config.connectionType === 'ws') {
                try {
                    if (this.websocketController) {
                        this.websocketController.closeConnection();
                    }
                } catch (e) {
                    this.log.error(e);
                }
            }
            try {
                if (this.statesController) {
                    await this.statesController.setAllAvailableToFalse();
                }
            } catch (e) {
                this.log.error(e);
            }
            try {
                if (this.websocketController) {
                    this.websocketController.allTimerClear();
                }
            } catch (e) {
                this.log.error(e);
            }
            try {
                if (this.statesController) {
                    this.statesController.allTimerClear();
                }
            } catch (e) {
                this.log.error(e);
            }

            await this.setStateAsync('info.connection', false, true);

            // Schedule-Job beenden
            const job = schedule.scheduledJobs['coordinatorCheck'];
            if (job) {
                job.cancel();
            }
        } finally {
            // callback() wird IMMER aufgerufen – auch wenn oben etwas wirft
            // Ohne das hängt der Adapter-Stop dauerhaft
            callback();
        }
    }

    /**
     * Reagiert auf Änderungen von ioBroker-States.
     * Wandelt den State-Change in eine Zigbee2MQTT-Nachricht um und sendet sie.
     *
     * @param {string} id        Vollständige State-ID (z.B. zigbee2mqtt.0.0xAABB.state)
     * @param {ioBroker.State | null | undefined} state Das neue State-Objekt
     */
    async onStateChange(id, state) {
        if (state && state.ack === false) {
            if (id.endsWith('info.debugmessages')) {
                this.logCustomizations.debugDevices = state.val != null ? String(state.val) : '';
                await this.setStateAsync(id, state.val, true);
                return;
            }
            if (id.endsWith('info.logfilter')) {
                this.logCustomizations.logfilter = state.val != null
                    ? String(state.val).split(';').filter((x) => x)
                    : [];
                await this.setStateAsync(id, state.val, true);
                return;
            }

            if (!this.z2mController) {
                this.log.debug(`onStateChange: z2mController not yet initialized, dropping state change for ${id}.`);
                return;
            }

            const message = await this.z2mController.createZ2MMessage(id, state);
            if (!message || !message.topic) {
                return;
            }

            if (['exmqtt', 'intmqtt'].includes(this.config.connectionType)) {
                if (!this.mqttClient || !this.mqttClient.connected) {
                    this.log.warn(`Cannot publish state, MQTT client not connected. (${id})`);
                    return;
                }
                if (!this.config.baseTopic) {
                    this.log.error('baseTopic is not configured – cannot publish state!');
                    return;
                }
                try {
                    this.mqttClient.publish(
                        `${this.config.baseTopic}/${message.topic}`,
                        JSON.stringify(message.payload),
                        (err) => {
                            if (err) {
                                this.log.error(`MQTT publish error for ${id}: ${err && err.message ? err.message : String(err)}`);
                            }
                        }
                    );
                } catch (e) {
                    this.log.error(`MQTT publish exception for ${id}: ${e}`);
                }
            } else if (this.config.connectionType === 'ws') {
                if (!this.websocketController) {
                    this.log.warn(`Cannot send state, WebSocket not initialized. (${id})`);
                    return;
                }
                this.websocketController.send(JSON.stringify({ topic: message.topic, payload: message.payload }));
            }
        }
    }
}

if (require.main !== module) {
    /**
     * @param {object} [options] Optionale Adapter-Konfiguration (AdapterOptions)
     */
    module.exports = (options) => new Zigbee2mqtt(options);
} else {
    new Zigbee2mqtt();
}
