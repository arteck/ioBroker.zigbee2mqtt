'use strict';

const assert = require('assert');
const { StatesController } = require('../../lib/statesController');

function makeAdapterMock(overrides = {}) {
    const logs = { info: [], warn: [], error: [], debug: [] };
    const setStateHistory = [];
    const setObjectHistory = [];
    return {
        logs,
        setStateHistory,
        setObjectHistory,
        log: {
            info:  (m) => logs.info.push(m),
            warn:  (m) => logs.warn.push(m),
            error: (m) => logs.error.push(m),
            debug: (m) => logs.debug.push(m),
        },
        // Synchrone setState-API (gibt ein Promise zurück, da der Code teils .catch() nutzt)
        setState: (id, val, ack) => {
            setStateHistory.push({ id, val, ack });
            return Promise.resolve();
        },
        setStateAsync: async (id, val, ack) => setStateHistory.push({ id, val, ack }),
        setStateChangedAsync: async (id, val, ack) => setStateHistory.push({ id, val, ack, changed: true }),
        setObjectNotExistsAsync: async (id, obj) => { setObjectHistory.push({ id, obj }); },
        getStatesAsync: async (_pattern) => ({}),
        // ioBroker-Timer-API (wird vom StatesController verwendet)
        setTimeout: (fn, ms) => setTimeout(fn, ms),
        clearTimeout: (handle) => clearTimeout(handle),
        config: { alwaysUpdateAvailableState: false, alwaysUpdateOccupancyState: false },
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

// ─── findDeviceByTopic (Map-Cache) ───────────────────────────────────────────
describe('StatesController.findDeviceByTopic', () => {
    it('gibt null zurück bei leerem Topic', () => {
        const { ctrl } = makeController();
        assert.strictEqual(ctrl.findDeviceByTopic(''), null);
        assert.strictEqual(ctrl.findDeviceByTopic(undefined), null);
    });

    it('findet ein Gerät aus dem deviceCache und cached es in der deviceMap', () => {
        const { ctrl, deviceCache } = makeController();
        const dev = { id: '0xAABB', ieee_address: '0xAABB', states: [] };
        deviceCache.push(dev);
        const found = ctrl.findDeviceByTopic('0xAABB');
        assert.strictEqual(found, dev);
        // Nach dem ersten Lookup muss der Eintrag im Map-Cache liegen
        assert.strictEqual(ctrl.deviceMap.get('0xAABB'), dev);
    });

    it('findet eine Gruppe aus dem groupCache', () => {
        const { ctrl, groupCache } = makeController();
        const grp = { id: 'group_1', ieee_address: 'group_1', states: [] };
        groupCache.push(grp);
        assert.strictEqual(ctrl.findDeviceByTopic('group_1'), grp);
    });

    it('gibt null zurück für unbekanntes Topic', () => {
        const { ctrl } = makeController();
        assert.strictEqual(ctrl.findDeviceByTopic('0xNope'), null);
    });

    it('liefert bei wiederholtem Aufruf den gecachten Eintrag (Map-Treffer)', () => {
        const { ctrl, deviceCache } = makeController();
        const dev = { id: '0xCACHE', ieee_address: '0xCACHE', states: [] };
        deviceCache.push(dev);
        assert.strictEqual(ctrl.findDeviceByTopic('0xCACHE'), dev);
        // deviceCache leeren – der Map-Cache muss den Eintrag weiterhin liefern
        deviceCache.length = 0;
        assert.strictEqual(ctrl.findDeviceByTopic('0xCACHE'), dev);
    });
});

// ─── clearDeviceMap (Cache-Invalidierung) ────────────────────────────────────
describe('StatesController.clearDeviceMap', () => {
    it('leert deviceMap und ensuredObjects', async () => {
        const { ctrl, deviceCache } = makeController();
        const dev = { id: '0xINV', ieee_address: '0xINV', states: [] };
        deviceCache.push(dev);
        // Map und ensuredObjects befüllen
        ctrl.findDeviceByTopic('0xINV');
        await ctrl.ensureObjectOnce('0xINV.foo', { type: 'state', common: {}, native: {} });
        assert.strictEqual(ctrl.deviceMap.size, 1);
        assert.strictEqual(ctrl.ensuredObjects.size, 1);

        ctrl.clearDeviceMap();
        assert.strictEqual(ctrl.deviceMap.size, 0);
        assert.strictEqual(ctrl.ensuredObjects.size, 0);
    });

    it('liefert nach clearDeviceMap eine neue Objektreferenz aus dem neu befüllten Cache', () => {
        const { ctrl, deviceCache } = makeController();
        const oldDev = { id: '0xNEW', ieee_address: '0xNEW', states: [] };
        deviceCache.push(oldDev);
        assert.strictEqual(ctrl.findDeviceByTopic('0xNEW'), oldDev);

        // Cache neu aufbauen mit neuer Referenz + Map invalidieren
        deviceCache.length = 0;
        ctrl.clearDeviceMap();
        const newDev = { id: '0xNEW', ieee_address: '0xNEW', states: [] };
        deviceCache.push(newDev);

        const found = ctrl.findDeviceByTopic('0xNEW');
        assert.strictEqual(found, newDev);
        assert.notStrictEqual(found, oldDev);
    });
});

// ─── ensureObjectOnce (Session-Cache) ────────────────────────────────────────
describe('StatesController.ensureObjectOnce', () => {
    it('ruft setObjectNotExistsAsync nur einmal pro ID auf', async () => {
        const { ctrl, adapter } = makeController();
        const objDef = { type: 'state', common: {}, native: {} };
        await ctrl.ensureObjectOnce('0xAA.foo', objDef);
        await ctrl.ensureObjectOnce('0xAA.foo', objDef);
        await ctrl.ensureObjectOnce('0xAA.foo', objDef);
        const calls = adapter.setObjectHistory.filter((c) => c.id === '0xAA.foo');
        assert.strictEqual(calls.length, 1);
        assert.ok(ctrl.ensuredObjects.has('0xAA.foo'));
    });

    it('ignoriert leere IDs', async () => {
        const { ctrl, adapter } = makeController();
        await ctrl.ensureObjectOnce('', {});
        await ctrl.ensureObjectOnce(undefined, {});
        assert.strictEqual(adapter.setObjectHistory.length, 0);
    });

    it('markiert ID nicht als ensured wenn setObjectNotExistsAsync fehlschlägt', async () => {
        const { ctrl } = makeController({
            setObjectNotExistsAsync: async () => { throw new Error('boom'); },
        });
        await ctrl.ensureObjectOnce('0xAA.bar', {});
        assert.ok(!ctrl.ensuredObjects.has('0xAA.bar'));
    });
});

// ─── setDeviceStateSafely – available & additional ───────────────────────────
describe('StatesController.setDeviceStateSafely (available/additional)', () => {
    it('setzt available=true wenn last_seen im Payload und Option aktiv', async () => {
        const { ctrl, adapter, deviceCache, createCache } = makeController({
            config: { alwaysUpdateAvailableState: true, alwaysUpdateOccupancyState: false },
        });
        deviceCache.push({
            id: '0xLS',
            ieee_address: '0xLS',
            states: [{ id: 'last_seen', prop: 'last_seen', type: 'number' }],
        });
        createCache['0xLS'] = { last_seen: { created: true } };
        await ctrl.processDeviceMessage({ topic: '0xLS', payload: { last_seen: 12345 } });
        assert.ok(adapter.setStateHistory.some((s) => s.id === '0xLS.available' && s.val === true));
    });

    it('legt additional-Objekt für unbekannte Payload-Keys nur einmal an', async () => {
        const { ctrl, adapter, deviceCache, createCache } = makeController();
        deviceCache.push({
            id: '0xADD',
            ieee_address: '0xADD',
            states: [{ id: 'brightness', prop: 'brightness', type: 'number' }],
        });
        createCache['0xADD'] = { brightness: { created: true } };
        // unbekannter Key "custom" → additional-Channel + State
        await ctrl.processDeviceMessage({ topic: '0xADD', payload: { brightness: 50, custom: 'x' } });
        await ctrl.processDeviceMessage({ topic: '0xADD', payload: { brightness: 60, custom: 'y' } });
        const addStateCreates = adapter.setObjectHistory.filter((c) => c.id === '0xADD.additional.custom');
        // ensureObjectOnce → nur ein Anlege-Aufruf trotz zweier Nachrichten
        assert.strictEqual(addStateCreates.length, 1);
        // additional-Wert wurde geschrieben
        assert.ok(adapter.setStateHistory.some((s) => s.id === '0xADD.additional.custom'));
    });

    it('schreibt mehrere States einer Nachricht (parallel)', async () => {
        const { ctrl, adapter, deviceCache, createCache } = makeController();
        deviceCache.push({
            id: '0xMULTI',
            ieee_address: '0xMULTI',
            states: [
                { id: 'brightness', prop: 'brightness', type: 'number' },
                { id: 'state', prop: 'state', type: 'boolean' },
                { id: 'linkquality', prop: 'linkquality', type: 'number' },
            ],
        });
        createCache['0xMULTI'] = {
            brightness: { created: true },
            state: { created: true },
            linkquality: { created: true },
        };
        await ctrl.processDeviceMessage({ topic: '0xMULTI', payload: { brightness: 100, state: true, linkquality: 80 } });
        assert.ok(adapter.setStateHistory.some((s) => s.id === '0xMULTI.brightness' && s.val === 100));
        assert.ok(adapter.setStateHistory.some((s) => s.id === '0xMULTI.state' && s.val === true));
        assert.ok(adapter.setStateHistory.some((s) => s.id === '0xMULTI.linkquality' && s.val === 80));
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
