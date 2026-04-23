'use strict';

const assert = require('assert');
const { StatesController } = require('../../lib/statesController');

function makeAdapterMock(overrides = {}) {
    const logs = { info: [], warn: [], error: [], debug: [] };
    const setStateHistory = [];
    return {
        logs,
        setStateHistory,
        log: {
            info:  (m) => logs.info.push(m),
            warn:  (m) => logs.warn.push(m),
            error: (m) => logs.error.push(m),
            debug: (m) => logs.debug.push(m),
        },
        setStateAsync: async (id, val, ack) => setStateHistory.push({ id, val, ack }),
        setStateChangedAsync: async (id, val, ack) => setStateHistory.push({ id, val, ack, changed: true }),
        setObjectNotExistsAsync: async () => {},
        getStatesAsync: async (_pattern) => ({}),
        // ioBroker-Timer-API (wird vom StatesController verwendet)
        setTimeout: (fn, ms) => setTimeout(fn, ms),
        clearTimeout: (handle) => clearTimeout(handle),
        config: { allwaysUpdateAvailableState: false, allwaysUpdateOccupancyState: false },
        ...overrides,
    };
}

function makeController(adapterOverrides = {}) {
    const adapter = makeAdapterMock(adapterOverrides);
    const deviceCache = [];
    const groupCache  = [];
    const logCustomizations = { debugDevices: '', logfilter: [] };
    const createCache = {};
    const ctrl = new StatesController(adapter, deviceCache, groupCache, logCustomizations, createCache);
    return { ctrl, adapter, deviceCache, groupCache, createCache };
}

// ─── processDeviceMessage – Basis ────────────────────────────────────────────
describe('StatesController.processDeviceMessage', () => {
    it('verwirft null/undefined-Nachrichten', async () => {
        const { ctrl, adapter } = makeController();
        await ctrl.processDeviceMessage(null);
        await ctrl.processDeviceMessage(undefined);
        assert.strictEqual(adapter.setStateHistory.length, 0);
    });

    it('verwirft Nachrichten mit leerem oder null-Payload', async () => {
        const { ctrl, adapter } = makeController();
        await ctrl.processDeviceMessage({ topic: 'device1', payload: null });
        await ctrl.processDeviceMessage({ topic: 'device1', payload: '' });
        assert.strictEqual(adapter.setStateHistory.length, 0);
    });

    it('legt unbekanntes Gerät in incStatsQueue (bis TTL 10)', async () => {
        const { ctrl } = makeController();
        for (let i = 0; i < 10; i++) {
            await ctrl.processDeviceMessage({ topic: '0xUnknown', payload: { brightness: 100 } });
        }
        // Nach 10 Retries sollte das Gerät aus der Queue entfernt werden
        assert.ok(ctrl.incStatsQueue.length <= 1);
    });

    it('aktualisiert bestehenden Queue-Eintrag statt neuen hinzuzufügen (neuester Payload gewinnt)', async () => {
        const { ctrl } = makeController();
        await ctrl.processDeviceMessage({ topic: '0xMissing', payload: { brightness: 50 } });
        await ctrl.processDeviceMessage({ topic: '0xMissing', payload: { brightness: 99 } });
        // Es soll nur EIN Eintrag in der Queue sein
        const entries = ctrl.incStatsQueue.filter((x) => x && x.topic === '0xMissing');
        assert.strictEqual(entries.length, 1);
        // Der Payload soll der neueste (99) sein
        assert.strictEqual(entries[0].payload.brightness, 99);
    });

    it('setzt Gerätestatus wenn Gerät im Cache und State erstellt', async () => {
        const { ctrl, adapter, deviceCache, createCache } = makeController();
        deviceCache.push({
            id: '0xAABB',
            ieee_address: '0xAABB',
            states: [{ id: 'brightness', prop: 'brightness', write: false, read: true, type: 'number' }],
        });
        createCache['0xAABB'] = { brightness: { created: true } };

        await ctrl.processDeviceMessage({ topic: '0xAABB', payload: { brightness: 200 } });
        assert.ok(adapter.setStateHistory.some((s) => s.id === '0xAABB.brightness'));
    });

    it('legt Gerät in Queue wenn State noch nicht in createCache', async () => {
        const { ctrl, deviceCache } = makeController();
        deviceCache.push({
            id: '0xAABB',
            ieee_address: '0xAABB',
            states: [{ id: 'brightness', prop: 'brightness', type: 'number' }],
        });
        // createCache ist leer → State noch nicht erstellt
        await ctrl.processDeviceMessage({ topic: '0xAABB', payload: { brightness: 200 } });
        assert.ok(ctrl.incStatsQueue.length > 0);
    });
});

// ─── setStateSafelyAsync ─────────────────────────────────────────────────────
describe('StatesController.setStateSafelyAsync', () => {
    it('ruft setStateAsync auf bei gültigem Wert', async () => {
        const { ctrl, adapter } = makeController();
        await ctrl.setStateSafelyAsync('0xAA.state', true);
        assert.ok(adapter.setStateHistory.some((s) => s.id === '0xAA.state' && s.val === true));
    });

    it('ruft setStateAsync NICHT auf bei null/undefined', async () => {
        const { ctrl, adapter } = makeController();
        await ctrl.setStateSafelyAsync('0xAA.state', null);
        await ctrl.setStateSafelyAsync('0xAA.state', undefined);
        assert.strictEqual(adapter.setStateHistory.length, 0);
    });
});

// ─── setStateChangedSafelyAsync ──────────────────────────────────────────────
describe('StatesController.setStateChangedSafelyAsync', () => {
    it('ruft setStateChangedAsync auf bei gültigem Wert', async () => {
        const { ctrl, adapter } = makeController();
        await ctrl.setStateChangedSafelyAsync('0xAA.brightness', 128);
        assert.ok(adapter.setStateHistory.some((s) => s.id === '0xAA.brightness' && s.val === 128));
    });

    it('ruft setStateChangedAsync NICHT auf bei undefined', async () => {
        const { ctrl, adapter } = makeController();
        await ctrl.setStateChangedSafelyAsync('0xAA.brightness', undefined);
        assert.strictEqual(adapter.setStateHistory.length, 0);
    });
});

// ─── setStateWithTimeoutAsync ────────────────────────────────────────────────
describe('StatesController.setStateWithTimeoutAsync', () => {
    it('setzt value=true sofort und resettet nach Timeout auf false', async () => {
        const { ctrl, adapter } = makeController();
        await ctrl.setStateWithTimeoutAsync('0xAA.action', true, 50);

        // Sofortige Setzung auf true
        assert.ok(adapter.setStateHistory.some((s) => s.id === '0xAA.action' && s.val === true));

        // Noch kein Reset (Timer noch nicht abgelaufen)
        assert.ok(!adapter.setStateHistory.some((s) => s.id === '0xAA.action' && s.val === false));

        // Warten bis Timer feuert
        await new Promise((r) => setTimeout(r, 120));
        assert.ok(adapter.setStateHistory.some((s) => s.id === '0xAA.action' && s.val === false));
    });

    it('setzt value=false sofort und startet KEINEN Auto-Reset-Timer', async () => {
        const { ctrl, adapter } = makeController();
        await ctrl.setStateWithTimeoutAsync('0xAA.move', false, 50);

        // Sofortige Setzung auf false
        assert.ok(adapter.setStateHistory.some((s) => s.id === '0xAA.move' && s.val === false));

        // Kein Timer eingetragen
        assert.strictEqual(ctrl.timeOutCache['0xAA.move'], undefined);

        // Nach Ablauf der Timeout-Zeit darf kein true erscheinen
        await new Promise((r) => setTimeout(r, 120));
        assert.ok(!adapter.setStateHistory.some((s) => s.id === '0xAA.move' && s.val === true));
    });

    it('bricht ohne Fehler ab bei null/undefined-Wert', async () => {
        const { ctrl, adapter } = makeController();
        await assert.doesNotReject(() => ctrl.setStateWithTimeoutAsync('0xAA.action', null, 50));
        await assert.doesNotReject(() => ctrl.setStateWithTimeoutAsync('0xAA.action', undefined, 50));
        assert.strictEqual(adapter.setStateHistory.length, 0);
    });

    it('löscht timeOutCache-Eintrag nach dem Reset', async () => {
        const { ctrl } = makeController();
        await ctrl.setStateWithTimeoutAsync('0xAA.action', true, 50);
        assert.ok(ctrl.timeOutCache['0xAA.action'] !== undefined);

        await new Promise((r) => setTimeout(r, 120));
        assert.strictEqual(ctrl.timeOutCache['0xAA.action'], undefined);
    });

    it('überschreibt bestehenden Timer bei erneutem Aufruf mit value=true (kein Doppel-Reset)', async () => {
        const { ctrl, adapter } = makeController();
        // Erster Aufruf, dann sofort zweiter – erster Timer wird gecancelt
        await ctrl.setStateWithTimeoutAsync('0xAA.action', true, 80);
        await ctrl.setStateWithTimeoutAsync('0xAA.action', true, 80);

        await new Promise((r) => setTimeout(r, 200));

        // Reset darf nur EINMAL geschrieben worden sein (zweiter Timer hat ersten gecancelt)
        const resets = adapter.setStateHistory.filter((s) => s.id === '0xAA.action' && s.val === false);
        assert.strictEqual(resets.length, 1);
    });

    it('value=false nach value=true cancelt laufenden Timer (kein false→true-Flip)', async () => {
        const { ctrl, adapter } = makeController();
        // Erst true setzen (startet Reset-Timer)
        await ctrl.setStateWithTimeoutAsync('0xAA.move', true, 80);
        // Dann sofort false setzen (Stop-Signal, soll Timer canceln)
        await ctrl.setStateWithTimeoutAsync('0xAA.move', false, 80);

        // Kein Timer mehr aktiv
        assert.strictEqual(ctrl.timeOutCache['0xAA.move'], undefined);

        await new Promise((r) => setTimeout(r, 200));

        // State-Reihenfolge: true, dann false – kein weiteres true danach
        const history = adapter.setStateHistory.filter((s) => s.id === '0xAA.move');
        assert.ok(history.length >= 2);
        assert.strictEqual(history[history.length - 1].val, false);
        // Kein auto-Reset auf true nach dem Stop
        const trueAfterStop = history.slice(2).some((s) => s.val === true);
        assert.strictEqual(trueAfterStop, false);
    });
});

// ─── processQueue ────────────────────────────────────────────────────────────
describe('StatesController.processQueue', () => {
    it('verarbeitet Queue-Einträge für bekannte Geräte', async () => {
        const { ctrl, adapter, deviceCache, createCache } = makeController();
        deviceCache.push({
            id: '0xCCDD',
            ieee_address: '0xCCDD',
            states: [{ id: 'state', prop: 'state', type: 'boolean' }],
        });
        createCache['0xCCDD'] = { state: { created: true } };
        ctrl.incStatsQueue.push({ topic: '0xCCDD', payload: { state: true } });

        await ctrl.processQueue();
        assert.ok(adapter.setStateHistory.some((s) => s.id === '0xCCDD.state'));
    });

    it('leert die Queue nach der Verarbeitung', async () => {
        const { ctrl, deviceCache, createCache } = makeController();
        deviceCache.push({
            id: '0xEEFF',
            ieee_address: '0xEEFF',
            states: [{ id: 'brightness', prop: 'brightness', type: 'number' }],
        });
        createCache['0xEEFF'] = { brightness: { created: true } };
        ctrl.incStatsQueue.push({ topic: '0xEEFF', payload: { brightness: 100 } });

        await ctrl.processQueue();
        assert.strictEqual(ctrl.incStatsQueue.length, 0);
    });
});

// ─── setAllAvailableToFalse ───────────────────────────────────────────────────
describe('StatesController.setAllAvailableToFalse', () => {
    it('setzt alle available-States auf false', async () => {
        const adapter = makeAdapterMock({
            getStatesAsync: async () => ({
                'zigbee2mqtt.0.0x0001.available': { val: true },
                'zigbee2mqtt.0.0x0002.available': { val: true },
            }),
        });
        const ctrl = new StatesController(adapter, [], [], { debugDevices: '' }, {});
        await ctrl.setAllAvailableToFalse();
        assert.ok(adapter.setStateHistory.some((s) => s.id === 'zigbee2mqtt.0.0x0001.available' && s.val === false));
        assert.ok(adapter.setStateHistory.some((s) => s.id === 'zigbee2mqtt.0.0x0002.available' && s.val === false));
    });

    it('bricht ohne Fehler ab wenn getStatesAsync null zurückgibt', async () => {
        const adapter = makeAdapterMock({ getStatesAsync: async () => null });
        const ctrl = new StatesController(adapter, [], [], { debugDevices: '' }, {});
        await assert.doesNotReject(() => ctrl.setAllAvailableToFalse());
    });
});

// ─── allTimerClear ────────────────────────────────────────────────────────────
describe('StatesController.allTimerClear', () => {
    it('löscht alle Timer und leert timeOutCache', async () => {
        const { ctrl, adapter } = makeController();
        // Timer über adapter.setTimeout eintragen (so wie der Code es tut)
        ctrl.timeOutCache['test1'] = adapter.setTimeout(() => {}, 10000);
        ctrl.timeOutCache['test2'] = adapter.setTimeout(() => {}, 10000);
        ctrl.allTimerClear();
        assert.deepStrictEqual(ctrl.timeOutCache, {});
    });

    it('funktioniert auch mit leerem timeOutCache', () => {
        const { ctrl } = makeController();
        assert.doesNotThrow(() => ctrl.allTimerClear());
        assert.deepStrictEqual(ctrl.timeOutCache, {});
    });
});
