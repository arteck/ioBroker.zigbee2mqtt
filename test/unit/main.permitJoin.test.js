'use strict';

/**
 * Verdrahtung von main.js zum PermitJoinController.
 * Teil 1: messageParse und onStateChange geben an den Controller weiter (Controller als Spion).
 * Teil 2: onReady, MQTT offline/close, WebSocket close und onUnload schließen das Anlernen;
 *         mit echtem Controller, ersetzt werden nur @iobroker/adapter-core und mqtt.
 * Teil 3: close() und bridge/info laufen im selben Mutex (beide Reihenfolgen).
 */

const assert = require('assert');
const path = require('path');
const { EventEmitter } = require('events');
const { WebsocketController } = require('../../lib/websocketController');

const corePath = require.resolve('@iobroker/adapter-core');
const mqttPath = require.resolve('mqtt');
const mainPath = path.join(__dirname, '../../main.js');

class FakeAdapter {
    constructor(options) {
        this.options = options;
        this.config = {};
        this.log = { info: () => {}, warn: () => {}, error: () => {}, debug: () => {} };
        /** @type {Record<string, {val: any, ack: boolean}>} */
        this.states = {};
        /** @type {Array<{id: string, val: any, ack: boolean}>} */
        this.writes = [];
        // true: jeder State-Zugriff wartet einen setImmediate-Schritt (macht Verzahnungen sichtbar)
        this.slow = false;
    }
    on() {}
    async waitIfSlow() {
        if (this.slow) {
            await new Promise((resolve) => setImmediate(resolve));
        }
    }
    async setStateAsync(id, val, ack) {
        await this.waitIfSlow();
        this.writes.push({ id, val, ack });
        this.states[id] = { val, ack };
    }
    async setStateChangedAsync(id, val, ack) {
        await this.waitIfSlow();
        const s = this.states[id];
        if (s && s.val === val && s.ack === ack) {
            return;
        }
        this.writes.push({ id, val, ack });
        this.states[id] = { val, ack };
    }
    setState(id, val, ack) {
        this.states[id] = { val, ack };
        return Promise.resolve();
    }
    async getStateAsync(id) {
        await this.waitIfSlow();
        return this.states[id] || null;
    }
    async getStatesAsync() {
        return {};
    }
    setTimeout(fn, ms) {
        return setTimeout(fn, ms);
    }
    clearTimeout(handle) {
        clearTimeout(handle);
    }
}

/** @type {Record<string, any>} */
const savedModules = {};

/**
 * @param {string} modulePath Aufgelöster Pfad des Moduls
 * @param {object} exports    Ersatz für module.exports
 */
function stubModule(modulePath, exports) {
    if (!(modulePath in savedModules)) {
        savedModules[modulePath] = require.cache[modulePath];
    }
    // @ts-expect-error: nur die von require genutzten Felder
    require.cache[modulePath] = { id: modulePath, filename: modulePath, loaded: true, exports };
}

function restoreModules() {
    delete require.cache[mainPath];
    for (const modulePath of Object.keys(savedModules)) {
        if (savedModules[modulePath]) {
            require.cache[modulePath] = savedModules[modulePath];
        } else {
            delete require.cache[modulePath];
        }
        delete savedModules[modulePath];
    }
}

/** @returns {any} Der Adapter aus main.js auf Basis von FakeAdapter */
function createAdapter() {
    stubModule(corePath, { Adapter: FakeAdapter });
    delete require.cache[mainPath];
    const create = require(mainPath);
    return create({});
}

/** @param {any} adapter Der Adapter */
function messages(adapter) {
    return adapter.writes.filter((w) => w.id === 'info.pairing_message').map((w) => w.val);
}

/** Wartet, bis anstehende Promise- und setImmediate-Schritte gelaufen sind (Event-Handler sind async). */
async function settle() {
    for (let i = 0; i < 20; i++) {
        await new Promise((resolve) => setImmediate(resolve));
    }
}

/** @type {any} */
let current = null;

afterEach(() => {
    if (current && current.permitJoinController && typeof current.permitJoinController.allTimerClear === 'function') {
        current.permitJoinController.allTimerClear();
    }
    current = null;
    restoreModules();
});

// ─── Teil 1: Weitergabe an den Controller (Spion) ────────────────────────────

function loadSpyAdapter() {
    const adapter = createAdapter();
    current = adapter;
    /** @type {Array<{name: string, args: any[]}>} */
    const calls = [];
    adapter.statesController = { setAllAvailableToFalse: async () => {}, processDeviceMessage: async () => {} };
    adapter.deviceController = {};
    adapter.z2mController = {
        createZ2MMessage: async () => ({ topic: 'bridge/request/permit_join', payload: { value: true, time: 254 } }),
    };
    // Felder des Controllers; jede andere Eigenschaft ist eine aufgezeichnete Methode
    const fields = { bridgeOnline: true };
    adapter.permitJoinController = new Proxy(fields, {
        get: (target, name) =>
            name in target ? target[name] : async (...args) => calls.push({ name: String(name), args }),
    });
    adapter.showInfo = false;
    adapter.scheduleRuntimeDeviceReload = () => {};
    return { adapter, calls, fields };
}

describe('main.js → PermitJoinController (Weitergabe)', () => {
    it('messageParse gibt bridge/info, bridge/event und bridge/response/permit_join weiter', async () => {
        const { adapter, calls } = loadSpyAdapter();
        const info = { permit_join: true, permit_join_end: 1 };
        const event = { type: 'device_joined', data: { ieee_address: '0x00158d0001a2b3c4' } };
        const response = { status: 'error', error: 'x' };
        await adapter.messageParse({ topic: 'bridge/info', payload: info });
        await adapter.messageParse({ topic: 'bridge/event', payload: event });
        await adapter.messageParse({ topic: 'bridge/response/permit_join', payload: response });
        assert.deepStrictEqual(calls, [
            { name: 'onBridgeInfo', args: [info] },
            { name: 'onBridgeEvent', args: [event] },
            { name: 'onPermitJoinResponse', args: [response] },
        ]);
    });

    it('bridge/state offline und online gehen an onBridgeState', async () => {
        const { adapter, calls } = loadSpyAdapter();
        await adapter.messageParse({ topic: 'bridge/state', payload: { state: 'offline' } });
        await adapter.messageParse({ topic: 'bridge/state', payload: { state: 'online' } });
        assert.deepStrictEqual(calls, [
            { name: 'onBridgeState', args: [false] },
            { name: 'onBridgeState', args: [true] },
        ]);
    });

    it('bridge/state offline schließt das Anlernen, auch wenn setAllAvailableToFalse wirft', async () => {
        const { adapter, calls } = loadSpyAdapter();
        adapter.statesController.setAllAvailableToFalse = async () => {
            throw new Error('objects db gone');
        };
        await assert.rejects(adapter.messageParse({ topic: 'bridge/state', payload: { state: 'offline' } }), /objects db gone/);
        assert.deepStrictEqual(calls, [{ name: 'onBridgeState', args: [false] }]);
    });

    it('onStateChange: permit_join ohne WebSocket-Verbindung meldet den Fehlschlag', async () => {
        const { adapter, calls } = loadSpyAdapter();
        adapter.config.connectionType = 'ws';
        adapter.websocketController = { send: () => false };
        await adapter.onStateChange('zigbee2mqtt.0.info.permit_join', { val: true, ack: false });
        assert.deepStrictEqual(calls, [{ name: 'onRequestFailed', args: ['no connection to Zigbee2MQTT'] }]);
    });

    it('onStateChange: permit_join ohne MQTT-Verbindung meldet den Fehlschlag', async () => {
        const { adapter, calls } = loadSpyAdapter();
        adapter.config.connectionType = 'exmqtt';
        adapter.mqttClient = { connected: false };
        await adapter.onStateChange('zigbee2mqtt.0.info.permit_join', { val: true, ack: false });
        assert.deepStrictEqual(calls, [{ name: 'onRequestFailed', args: ['no connection to Zigbee2MQTT'] }]);
    });

    it('onStateChange: MQTT verbunden, aber Zigbee2MQTT offline → sofort abgelehnt, nichts gesendet', async () => {
        const { adapter, calls, fields } = loadSpyAdapter();
        fields.bridgeOnline = false;
        adapter.config.connectionType = 'exmqtt';
        adapter.config.baseTopic = 'zigbee2mqtt';
        const published = [];
        adapter.mqttClient = { connected: true, publish: (topic) => published.push(topic) };
        await adapter.onStateChange('zigbee2mqtt.0.info.permit_join', { val: true, ack: false });
        assert.deepStrictEqual(published, []);
        assert.deepStrictEqual(calls, [{ name: 'onRequestFailed', args: ['Zigbee2MQTT is offline'] }]);
    });

    it('onStateChange: erfolgreich gesendet → kein Fehlschlag', async () => {
        const { adapter, calls } = loadSpyAdapter();
        adapter.config.connectionType = 'ws';
        const sent = [];
        adapter.websocketController = { send: (m) => sent.push(JSON.parse(m)) > 0 };
        await adapter.onStateChange('zigbee2mqtt.0.info.permit_join', { val: true, ack: false });
        assert.deepStrictEqual(sent, [{ topic: 'bridge/request/permit_join', payload: { value: true, time: 254 } }]);
        assert.deepStrictEqual(calls, []);
    });
});

// ─── Teil 2: Haken mit echtem Controller ─────────────────────────────────────

const MQTT_CONFIG = {
    connectionType: 'exmqtt',
    externalMqttServerIP: '127.0.0.1',
    externalMqttServerPort: 1883,
    baseTopic: 'zigbee2mqtt',
};

function makeFakeMqttClient() {
    /** @type {any} */
    const client = new EventEmitter();
    client.connected = false;
    client.subscribe = () => {};
    client.publish = (_topic, _payload, cb) => cb && cb();
    client.end = () => {};
    return client;
}

/**
 * Startet den echten Adapter aus main.js (onReady) mit einem Ersatz-MQTT-Client.
 *
 * @param {object} config                     Adapter-Konfiguration
 * @param {Record<string, any>} [initialStates] States vor dem Start (z.B. vom letzten Lauf)
 */
async function startRealAdapter(config, initialStates = {}) {
    const client = makeFakeMqttClient();
    stubModule(mqttPath, { connect: () => client });
    const adapter = createAdapter();
    current = adapter;
    Object.assign(adapter.states, initialStates);
    adapter.config = { ...config };
    adapter.showInfo = false;
    await adapter.onReady();
    return { adapter, client };
}

/**
 * Öffnet das Anlernen über bridge/state und bridge/info wie Zigbee2MQTT (1.x-Form ohne Ende, also ohne Countdown).
 *
 * @param {any} adapter Der Adapter
 */
async function openPairing(adapter) {
    await adapter.messageParse({ topic: 'bridge/state', payload: { state: 'online' } });
    await adapter.messageParse({ topic: 'bridge/info', payload: { permit_join: true } });
    assert.deepStrictEqual(adapter.states['info.permit_join'], { val: true, ack: true });
}

describe('main.js Haken schließen das Anlernen (echter Controller)', () => {
    it('onReady: ein vom letzten Lauf offener Schalter wird zurückgesetzt', async () => {
        const { adapter } = await startRealAdapter(MQTT_CONFIG, { 'info.permit_join': { val: true, ack: true } });
        assert.deepStrictEqual(adapter.states['info.permit_join'], { val: false, ack: true });
        assert.deepStrictEqual(messages(adapter), ['Pairing closed: adapter restarted']);
    });

    it('MQTT offline schließt das Anlernen', async () => {
        const { adapter, client } = await startRealAdapter(MQTT_CONFIG);
        await openPairing(adapter);
        client.emit('offline');
        await settle();
        assert.deepStrictEqual(adapter.states['info.permit_join'], { val: false, ack: true });
        assert.strictEqual(messages(adapter).at(-1), 'Pairing closed: connection to Zigbee2MQTT lost');
    });

    it('MQTT close schließt das Anlernen', async () => {
        const { adapter, client } = await startRealAdapter(MQTT_CONFIG);
        await openPairing(adapter);
        client.emit('close');
        await settle();
        assert.deepStrictEqual(adapter.states['info.permit_join'], { val: false, ack: true });
        assert.strictEqual(messages(adapter).at(-1), 'Pairing closed: connection to Zigbee2MQTT lost');
    });

    it('WebSocket close schließt das Anlernen', async () => {
        // ohne wsServerIP baut onReady keine echte WebSocket-Verbindung auf
        const { adapter } = await startRealAdapter({ connectionType: 'ws', wsServerIP: '' });
        await openPairing(adapter);
        const ws = new WebsocketController(adapter);
        ws._intentionalClose = true; // kein Reconnect im Test
        await ws._onWsClose(1006, Buffer.from(''));
        assert.deepStrictEqual(adapter.states['info.permit_join'], { val: false, ack: true });
        assert.strictEqual(messages(adapter).at(-1), 'Pairing closed: connection to Zigbee2MQTT lost');
    });

    it('onUnload schließt das Anlernen', async () => {
        const { adapter } = await startRealAdapter(MQTT_CONFIG);
        await openPairing(adapter);
        await new Promise((resolve) => adapter.onUnload(resolve));
        assert.deepStrictEqual(adapter.states['info.permit_join'], { val: false, ack: true });
        assert.strictEqual(messages(adapter).at(-1), 'Pairing closed: adapter stopped');
    });
});

// ─── Teil 3: close() und bridge/info im selben Mutex ─────────────────────────

describe('main.js: close() und bridge/info verzahnen sich nicht', () => {
    it('bridge/info läuft gerade, dann close: close wartet, danach geschlossen und kein Countdown', async () => {
        const { adapter } = await startRealAdapter(MQTT_CONFIG);
        await adapter.messageParse({ topic: 'bridge/state', payload: { state: 'online' } });
        adapter.slow = true;
        const info = adapter.messageParse({
            topic: 'bridge/info',
            payload: { permit_join: true, permit_join_end: Date.now() + 120_000 },
        });
        await new Promise((resolve) => setImmediate(resolve)); // bridge/info ist mitten in der Verarbeitung
        const close = adapter.closePermitJoin('connection to Zigbee2MQTT lost');
        await Promise.all([info, close]);
        assert.strictEqual(adapter.permitJoinController.countdownTimer, null);
        assert.deepStrictEqual(adapter.states['info.permit_join'], { val: false, ack: true });
        assert.deepStrictEqual(adapter.states['info.permit_join_timeout'], { val: 0, ack: true });
        const msgs = messages(adapter);
        assert.strictEqual(msgs.length, 2);
        assert.ok(msgs[0].startsWith('Pairing open for '));
        assert.strictEqual(msgs[1], 'Pairing closed: connection to Zigbee2MQTT lost');
    });

    it('close zuerst, bridge/info kommt währenddessen (schneller Reconnect): öffnet erst nach bridge/state online', async () => {
        const { adapter } = await startRealAdapter(MQTT_CONFIG);
        await openPairing(adapter);
        adapter.slow = true;
        const close = adapter.closePermitJoin('connection to Zigbee2MQTT lost');
        const info = adapter.messageParse({ topic: 'bridge/info', payload: { permit_join: true } });
        await Promise.all([close, info]);
        assert.deepStrictEqual(adapter.states['info.permit_join'], { val: false, ack: true });

        await adapter.messageParse({ topic: 'bridge/state', payload: { state: 'online' } });
        assert.deepStrictEqual(adapter.states['info.permit_join'], { val: true, ack: true });
        assert.deepStrictEqual(messages(adapter), [
            'Pairing open',
            'Pairing closed: connection to Zigbee2MQTT lost',
            'Pairing open',
        ]);
    });

    it('bridge/state offline, dahinter ein wartendes bridge/info: der Schalter bleibt zu', async () => {
        const { adapter } = await startRealAdapter(MQTT_CONFIG);
        await openPairing(adapter);
        adapter.slow = true;
        const offline = adapter.messageParse({ topic: 'bridge/state', payload: { state: 'offline' } });
        const info = adapter.messageParse({
            topic: 'bridge/info',
            payload: { permit_join: true, permit_join_end: Date.now() + 120_000 },
        });
        await Promise.all([offline, info]);
        assert.deepStrictEqual(adapter.states['info.permit_join'], { val: false, ack: true });
        assert.strictEqual(adapter.permitJoinController.countdownTimer, null);
        assert.strictEqual(messages(adapter).at(-1), 'Pairing closed: Zigbee2MQTT offline');
    });
});
