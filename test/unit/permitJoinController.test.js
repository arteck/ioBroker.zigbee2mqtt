'use strict';

const assert = require('assert');
const { PermitJoinController, PERMIT_JOIN_MAX_TIME } = require('../../lib/permitJoinController');

function makeAdapterMock() {
    /** @type {Record<string, {val: any, ack: boolean}>} */
    const states = {};
    /** @type {Array<{id: string, val: any, ack: boolean}>} */
    const writes = [];
    /** @type {Record<'info'|'warn'|'error'|'debug', string[]>} */
    const logs = { info: [], warn: [], error: [], debug: [] };
    return {
        states,
        writes,
        logs,
        log: {
            info:  (m) => logs.info.push(m),
            warn:  (m) => logs.warn.push(m),
            error: (m) => logs.error.push(m),
            debug: (m) => logs.debug.push(m),
        },
        getStateAsync: async (id) => states[id] || null,
        setStateAsync: async (id, val, ack) => {
            writes.push({ id, val, ack });
            states[id] = { val, ack };
        },
        setStateChangedAsync: async (id, val, ack) => {
            if (states[id] && states[id].val === val && states[id].ack === ack) {
                return;
            }
            writes.push({ id, val, ack });
            states[id] = { val, ack };
        },
    };
}

/**
 * @param {number}  [startMs] Startzeit der Test-Uhr
 * @param {boolean} [online]  true: Zigbee2MQTT hat bereits bridge/state "online" gemeldet
 */
function makeController(startMs = 1_000_000, online = true) {
    const clock = { ms: startMs };
    const adapter = makeAdapterMock();
    const ctrl = new PermitJoinController(adapter, () => clock.ms);
    if (online) {
        ctrl.bridgeOnline = true;
    }
    return { ctrl, adapter, clock };
}

function messages(adapter) {
    return adapter.writes.filter((w) => w.id === 'info.pairing_message').map((w) => w.val);
}

// ─── createRequest ───────────────────────────────────────────────────────────
describe('PermitJoinController.createRequest', () => {
    it('öffnet das Anlernen für die maximale Dauer', () => {
        const msg = PermitJoinController.createRequest(true);
        assert.strictEqual(msg.topic, 'bridge/request/permit_join');
        assert.deepStrictEqual(msg.payload, { value: true, time: PERMIT_JOIN_MAX_TIME });
        assert.strictEqual(PERMIT_JOIN_MAX_TIME, 254);
    });

    it('schließt das Anlernen mit time 0', () => {
        assert.deepStrictEqual(PermitJoinController.createRequest(false).payload, { value: false, time: 0 });
    });

    it('wertet "true" und 1 als öffnen, alles andere als schließen', () => {
        assert.strictEqual(PermitJoinController.createRequest('true').payload.time, 254);
        assert.strictEqual(PermitJoinController.createRequest(1).payload.time, 254);
        assert.strictEqual(PermitJoinController.createRequest('false').payload.time, 0);
        assert.strictEqual(PermitJoinController.createRequest(null).payload.time, 0);
    });
});

// ─── onBridgeInfo ────────────────────────────────────────────────────────────
describe('PermitJoinController.onBridgeInfo', () => {
    it('ignoriert bridge/info ohne permit_join', async () => {
        const { ctrl, adapter } = makeController();
        await ctrl.onBridgeInfo({ version: '2.6.0' });
        await ctrl.onBridgeInfo(null);
        assert.deepStrictEqual(adapter.writes, []);
    });

    it('Zigbee2MQTT 2.x: bestätigt das Öffnen und rechnet die Restsekunden aus permit_join_end', async () => {
        const { ctrl, adapter, clock } = makeController();
        try {
            await ctrl.onBridgeInfo({ permit_join: true, permit_join_end: clock.ms + 254_000 });
            assert.deepStrictEqual(adapter.states['info.permit_join'], { val: true, ack: true });
            assert.deepStrictEqual(adapter.states['info.permit_join_timeout'], { val: 254, ack: true });
            assert.deepStrictEqual(messages(adapter), ['Pairing open for 254 seconds']);
            assert.ok(ctrl.countdownTimer, 'countdown runs while pairing is open');
        } finally {
            ctrl.allTimerClear();
        }
    });

    it('Zigbee2MQTT 1.x: nimmt permit_join_timeout als Restsekunden', async () => {
        const { ctrl, adapter } = makeController();
        try {
            await ctrl.onBridgeInfo({ permit_join: true, permit_join_timeout: 120 });
            assert.deepStrictEqual(adapter.states['info.permit_join_timeout'], { val: 120, ack: true });
            assert.deepStrictEqual(messages(adapter), ['Pairing open for 120 seconds']);
        } finally {
            ctrl.allTimerClear();
        }
    });

    it('begrenzt die Restsekunden auf höchstens 254 (Uhrenabweichung)', async () => {
        const { ctrl, adapter, clock } = makeController();
        try {
            await ctrl.onBridgeInfo({ permit_join: true, permit_join_end: clock.ms + 400_000 });
            assert.strictEqual(adapter.states['info.permit_join_timeout'].val, 254);
        } finally {
            ctrl.allTimerClear();
        }
    });

    it('wertet ein bridge/info mit abgelaufenem permit_join_end als geschlossen (z.B. retained)', async () => {
        const { ctrl, adapter, clock } = makeController();
        try {
            // Adapterstart mit veraltetem retained bridge/info: geschlossen, keine Meldung
            await ctrl.onBridgeInfo({ permit_join: true, permit_join_end: clock.ms - 5_000 });
            assert.deepStrictEqual(adapter.states['info.permit_join'], { val: false, ack: true });
            assert.deepStrictEqual(adapter.states['info.permit_join_timeout'], { val: 0, ack: true });
            assert.strictEqual(ctrl.countdownTimer, null);
            assert.deepStrictEqual(messages(adapter), []);

            // war es offen, wird das Schließen gemeldet
            await ctrl.onBridgeInfo({ permit_join: true, permit_join_end: clock.ms + 60_000 });
            await ctrl.onBridgeInfo({ permit_join: true, permit_join_end: clock.ms });
            assert.deepStrictEqual(adapter.states['info.permit_join'], { val: false, ack: true });
            assert.strictEqual(ctrl.countdownTimer, null);
            assert.deepStrictEqual(messages(adapter), ['Pairing open for 60 seconds', 'Pairing closed']);
        } finally {
            ctrl.allTimerClear();
        }
    });

    it('startet nach allTimerClear (Adapter entladen) keinen Countdown mehr', async () => {
        const { ctrl, adapter, clock } = makeController();
        ctrl.allTimerClear();
        await ctrl.onBridgeInfo({ permit_join: true, permit_join_end: clock.ms + 60_000 });
        assert.strictEqual(adapter.states['info.permit_join'].val, true);
        assert.strictEqual(ctrl.countdownTimer, null);
    });

    it('meldet "Pairing open" ohne Sekunden, wenn kein Ende bekannt ist', async () => {
        const { ctrl, adapter } = makeController();
        await ctrl.onBridgeInfo({ permit_join: true });
        assert.deepStrictEqual(messages(adapter), ['Pairing open']);
        assert.strictEqual(ctrl.countdownTimer, null);
    });

    it('meldet das Schließen nur nach einem bekannten offenen Zustand', async () => {
        const { ctrl, adapter, clock } = makeController();
        try {
            // Start des Adapters: geschlossen, keine Meldung
            await ctrl.onBridgeInfo({ permit_join: false });
            assert.deepStrictEqual(adapter.states['info.permit_join'], { val: false, ack: true });
            assert.deepStrictEqual(messages(adapter), []);

            await ctrl.onBridgeInfo({ permit_join: true, permit_join_end: clock.ms + 60_000 });
            // erneutes bridge/info (z.B. neues Ende) meldet nicht noch einmal "open"
            await ctrl.onBridgeInfo({ permit_join: true, permit_join_end: clock.ms + 200_000 });
            assert.strictEqual(adapter.states['info.permit_join_timeout'].val, 200);

            await ctrl.onBridgeInfo({ permit_join: false });
            assert.deepStrictEqual(adapter.states['info.permit_join'], { val: false, ack: true });
            assert.deepStrictEqual(adapter.states['info.permit_join_timeout'], { val: 0, ack: true });
            assert.strictEqual(ctrl.countdownTimer, null);
            assert.deepStrictEqual(messages(adapter), ['Pairing open for 60 seconds', 'Pairing closed']);
        } finally {
            ctrl.allTimerClear();
        }
    });
});

// ─── countdownTick ───────────────────────────────────────────────────────────
describe('PermitJoinController.countdownTick', () => {
    it('zählt die Restsekunden herunter und stoppt bei 0', async () => {
        const { ctrl, adapter, clock } = makeController();
        try {
            await ctrl.onBridgeInfo({ permit_join: true, permit_join_end: clock.ms + 3_000 });
            clock.ms += 1_000;
            await ctrl.countdownTick();
            assert.strictEqual(adapter.states['info.permit_join_timeout'].val, 2);
            clock.ms += 2_500;
            await ctrl.countdownTick();
            assert.strictEqual(adapter.states['info.permit_join_timeout'].val, 0);
            assert.strictEqual(ctrl.countdownTimer, null);
            // das Schließen selbst kommt erst mit bridge/info
            assert.deepStrictEqual(adapter.states['info.permit_join'], { val: true, ack: true });
        } finally {
            ctrl.allTimerClear();
        }
    });
});

// ─── onBridgeEvent ───────────────────────────────────────────────────────────
describe('PermitJoinController.onBridgeEvent', () => {
    const ieee = '0x00158d0001a2b3c4';

    it('meldet einen neu beigetretenen Teilnehmer', async () => {
        const { ctrl, adapter } = makeController();
        await ctrl.onBridgeEvent({ type: 'device_joined', data: { friendly_name: ieee, ieee_address: ieee } });
        assert.deepStrictEqual(messages(adapter), [`Device ${ieee} joined`]);
        assert.deepStrictEqual(adapter.states['info.pairing_message'], { val: `Device ${ieee} joined`, ack: true });
    });

    it('meldet Start, Erfolg und Fehlschlag des Interviews', async () => {
        const { ctrl, adapter } = makeController();
        await ctrl.onBridgeEvent({ type: 'device_interview', data: { ieee_address: ieee, status: 'started' } });
        await ctrl.onBridgeEvent({
            type: 'device_interview',
            data: { ieee_address: ieee, status: 'successful', supported: true, definition: { vendor: 'IKEA', model: 'E1743' } },
        });
        await ctrl.onBridgeEvent({ type: 'device_interview', data: { ieee_address: ieee, status: 'successful', supported: false, definition: null } });
        await ctrl.onBridgeEvent({ type: 'device_interview', data: { ieee_address: ieee, status: 'failed' } });
        assert.deepStrictEqual(messages(adapter), [
            `Interview started: ${ieee}`,
            `Interview successful: ${ieee}, IKEA E1743`,
            `Interview successful: ${ieee}, device not supported`,
            `Interview failed: ${ieee}`,
        ]);
    });

    it('ignoriert andere Ereignisse und Ereignisse ohne Gerät', async () => {
        const { ctrl, adapter } = makeController();
        await ctrl.onBridgeEvent({ type: 'device_announce', data: { ieee_address: ieee } });
        await ctrl.onBridgeEvent({ type: 'device_leave', data: { ieee_address: ieee } });
        await ctrl.onBridgeEvent({ type: 'device_joined', data: {} });
        await ctrl.onBridgeEvent(null);
        assert.deepStrictEqual(adapter.writes, []);
    });
});

// ─── onPermitJoinResponse ────────────────────────────────────────────────────
describe('PermitJoinController.onPermitJoinResponse', () => {
    it('ignoriert eine erfolgreiche Antwort', async () => {
        const { ctrl, adapter } = makeController();
        await ctrl.onPermitJoinResponse({ data: { time: 254 }, status: 'ok' });
        assert.deepStrictEqual(adapter.writes, []);
    });

    it('meldet einen Fehler und setzt den Schalter auf den bekannten Zustand zurück', async () => {
        const { ctrl, adapter } = makeController();
        await ctrl.onBridgeInfo({ permit_join: false });
        await ctrl.onPermitJoinResponse({ data: {}, status: 'error', error: 'Device not found' });
        assert.deepStrictEqual(adapter.states['info.permit_join'], { val: false, ack: true });
        assert.deepStrictEqual(messages(adapter), ['Pairing failed: Device not found']);
    });
});

// ─── onRequestFailed ─────────────────────────────────────────────────────────
describe('PermitJoinController.onRequestFailed', () => {
    it('setzt den Schalter auf den letzten Zustand von Zigbee2MQTT zurück (ack) und meldet den Grund', async () => {
        const { ctrl, adapter, clock } = makeController();
        try {
            await ctrl.onBridgeInfo({ permit_join: true, permit_join_end: clock.ms + 60_000 });
            // Schließen gewünscht (ack=false), aber die Anfrage kam nicht an
            await adapter.setStateAsync('info.permit_join', false, false);
            await ctrl.onRequestFailed('no connection to Zigbee2MQTT');
            assert.deepStrictEqual(adapter.states['info.permit_join'], { val: true, ack: true });
            assert.deepStrictEqual(messages(adapter), [
                'Pairing open for 60 seconds',
                'Pairing failed: no connection to Zigbee2MQTT',
            ]);
        } finally {
            ctrl.allTimerClear();
        }
    });

    it('ohne bekannten Zustand zurück auf false (ack)', async () => {
        const { ctrl, adapter } = makeController();
        await adapter.setStateAsync('info.permit_join', true, false);
        await ctrl.onRequestFailed('no connection to Zigbee2MQTT');
        assert.deepStrictEqual(adapter.states['info.permit_join'], { val: false, ack: true });
    });
});

// ─── close ───────────────────────────────────────────────────────────────────
describe('PermitJoinController.close', () => {
    it('Verbindung verloren: ein offenes Anlernen wird geschlossen gemeldet', async () => {
        const { ctrl, adapter, clock } = makeController();
        try {
            await ctrl.onBridgeInfo({ permit_join: true, permit_join_end: clock.ms + 200_000 });
            assert.ok(ctrl.countdownTimer);
            await ctrl.close('connection to Zigbee2MQTT lost');
            assert.deepStrictEqual(adapter.states['info.permit_join'], { val: false, ack: true });
            assert.deepStrictEqual(adapter.states['info.permit_join_timeout'], { val: 0, ack: true });
            assert.strictEqual(ctrl.countdownTimer, null);
            assert.deepStrictEqual(messages(adapter), [
                'Pairing open for 200 seconds',
                'Pairing closed: connection to Zigbee2MQTT lost',
            ]);

            // nach dem Reconnect: bridge/info vor bridge/state "online" wird erst danach übernommen
            await ctrl.onBridgeInfo({ permit_join: true, permit_join_end: clock.ms + 150_000 });
            assert.deepStrictEqual(adapter.states['info.permit_join'], { val: false, ack: true });
            await ctrl.onBridgeState(true);
            assert.deepStrictEqual(adapter.states['info.permit_join'], { val: true, ack: true });
            assert.strictEqual(messages(adapter).at(-1), 'Pairing open for 150 seconds');
        } finally {
            ctrl.allTimerClear();
        }
    });

    it('Adapterstart: ein vom letzten Lauf offener Schalter wird zurückgesetzt', async () => {
        const { ctrl, adapter } = makeController();
        adapter.states['info.permit_join'] = { val: true, ack: true };
        adapter.states['info.permit_join_timeout'] = { val: 120, ack: true };
        await ctrl.close('adapter restarted');
        assert.deepStrictEqual(adapter.states['info.permit_join'], { val: false, ack: true });
        assert.deepStrictEqual(adapter.states['info.permit_join_timeout'], { val: 0, ack: true });
        assert.deepStrictEqual(messages(adapter), ['Pairing closed: adapter restarted']);
    });

    it('bereits geschlossen: kein Schreiben des Schalters und keine Meldung', async () => {
        const { ctrl, adapter } = makeController();
        await ctrl.onBridgeInfo({ permit_join: false });
        const before = adapter.writes.length;
        await ctrl.close('connection to Zigbee2MQTT lost');
        await ctrl.close('connection to Zigbee2MQTT lost');
        assert.strictEqual(adapter.writes.length, before);
        assert.deepStrictEqual(messages(adapter), []);
    });

    it('ein unbestätigter Wunsch (ack=false) wird auf false mit ack zurückgesetzt', async () => {
        const { ctrl, adapter } = makeController();
        adapter.states['info.permit_join'] = { val: false, ack: false };
        await ctrl.close('adapter restarted');
        assert.deepStrictEqual(adapter.states['info.permit_join'], { val: false, ack: true });
        assert.deepStrictEqual(messages(adapter), []);
    });
});

// ─── bridge/state: nur öffnen, solange Zigbee2MQTT online ist ────────────────
describe('PermitJoinController.onBridgeState', () => {
    it('unbekannter Zustand: bridge/info öffnet nicht, wird bei "online" übernommen', async () => {
        const { ctrl, adapter, clock } = makeController(1_000_000, false);
        try {
            // retained bridge/info kommt nach dem Verbinden vor bridge/state
            await ctrl.onBridgeInfo({ permit_join: true, permit_join_end: clock.ms + 90_000 });
            assert.strictEqual(adapter.states['info.permit_join'], undefined);
            assert.strictEqual(ctrl.countdownTimer, null);
            assert.deepStrictEqual(messages(adapter), []);

            await ctrl.onBridgeState(true);
            assert.deepStrictEqual(adapter.states['info.permit_join'], { val: true, ack: true });
            assert.deepStrictEqual(adapter.states['info.permit_join_timeout'], { val: 90, ack: true });
            assert.deepStrictEqual(messages(adapter), ['Pairing open for 90 seconds']);
            assert.strictEqual(ctrl.pendingInfo, null);
        } finally {
            ctrl.allTimerClear();
        }
    });

    it('offline gemeldet: bridge/info öffnet nicht (auch 1.x ohne Ende) und wird nicht nachgeholt', async () => {
        const { ctrl, adapter, clock } = makeController();
        try {
            await ctrl.onBridgeState(false);
            await ctrl.onBridgeInfo({ permit_join: true, permit_join_end: clock.ms + 90_000 });
            await ctrl.onBridgeInfo({ permit_join: true });
            assert.deepStrictEqual(adapter.states['info.permit_join'], { val: false, ack: true });
            assert.strictEqual(ctrl.countdownTimer, null);

            // "online" holt das veraltete bridge/info nicht nach; erst ein neues öffnet
            await ctrl.onBridgeState(true);
            assert.deepStrictEqual(adapter.states['info.permit_join'], { val: false, ack: true });
            await ctrl.onBridgeInfo({ permit_join: true, permit_join_end: clock.ms + 30_000 });
            assert.deepStrictEqual(adapter.states['info.permit_join'], { val: true, ack: true });
            assert.deepStrictEqual(messages(adapter), ['Pairing open for 30 seconds']);
        } finally {
            ctrl.allTimerClear();
        }
    });

    it('offline schließt ein offenes Anlernen und meldet den Grund', async () => {
        const { ctrl, adapter, clock } = makeController();
        try {
            await ctrl.onBridgeInfo({ permit_join: true, permit_join_end: clock.ms + 60_000 });
            await ctrl.onBridgeState(false);
            assert.deepStrictEqual(adapter.states['info.permit_join'], { val: false, ack: true });
            assert.deepStrictEqual(adapter.states['info.permit_join_timeout'], { val: 0, ack: true });
            assert.strictEqual(ctrl.countdownTimer, null);
            assert.strictEqual(ctrl.bridgeOnline, false);
            assert.deepStrictEqual(messages(adapter), ['Pairing open for 60 seconds', 'Pairing closed: Zigbee2MQTT offline']);
        } finally {
            ctrl.allTimerClear();
        }
    });

    it('close verwirft ein zurückgehaltenes bridge/info', async () => {
        const { ctrl, adapter, clock } = makeController(1_000_000, false);
        await ctrl.onBridgeInfo({ permit_join: true, permit_join_end: clock.ms + 90_000 });
        await ctrl.close('connection to Zigbee2MQTT lost');
        assert.strictEqual(ctrl.bridgeOnline, null);
        await ctrl.onBridgeState(true);
        assert.deepStrictEqual(adapter.states['info.permit_join'], { val: false, ack: true });
        assert.strictEqual(ctrl.countdownTimer, null);
    });
});
