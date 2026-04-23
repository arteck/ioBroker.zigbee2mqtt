'use strict';

const assert = require('assert');
const { Z2mController } = require('../../lib/z2mController');

function makeAdapterMock() {
    const logs = { info: [], warn: [], error: [], debug: [] };
    const setStates = [];
    return {
        logs,
        setStates,
        log: {
            info:  (m) => logs.info.push(m),
            warn:  (m) => logs.warn.push(m),
            error: (m) => logs.error.push(m),
            debug: (m) => logs.debug.push(m),
        },
        // Z2mController nutzt jetzt setStateAsync (await) statt setState
        setStateAsync: async (id, val, ack) => setStates.push({ id, val, ack }),
        setState: (id, val, ack) => setStates.push({ id, val, ack }),
        getStateAsync: async (_id) => ({ val: null }),
        config: {},
    };
}

function makeController(deviceCache = [], groupCache = []) {
    const adapter = makeAdapterMock();
    const logCustomizations = { debugDevices: '', logfilter: [] };
    return { ctrl: new Z2mController(adapter, deviceCache, groupCache, logCustomizations), adapter };
}

// ─── createZ2MMessage ────────────────────────────────────────────────────────
describe('Z2mController.createZ2MMessage', () => {
    it('gibt undefined zurück bei ungültiger ID (< 4 Segmente)', async () => {
        const { ctrl } = makeController();
        const result = await ctrl.createZ2MMessage('zigbee2mqtt.0', { val: true, ack: false });
        assert.strictEqual(result, undefined);
    });

    it('gibt coordinator_check-Topic zurück', async () => {
        const { ctrl } = makeController();
        const result = await ctrl.createZ2MMessage(
            'zigbee2mqtt.0._.info.coordinator_check',
            { val: null, ack: false }
        );
        assert.ok(result);
        assert.strictEqual(result.topic, 'bridge/request/coordinator_check');
        assert.deepStrictEqual(result.payload, {});
    });

    it('gibt undefined zurück wenn Gerät nicht im Cache', async () => {
        const { ctrl } = makeController();
        const result = await ctrl.createZ2MMessage(
            'zigbee2mqtt.0.0x0001.state',
            { val: true, ack: false }
        );
        assert.strictEqual(result, undefined);
    });

    it('erstellt einfache Nachricht für State ohne setter', async () => {
        const device = {
            id: 'TestDevice',
            ieee_address: '0x0001',
            optionsValues: {},
            states: [{ id: 'brightness', write: true, read: true, type: 'number' }],
        };
        const { ctrl } = makeController([device]);
        const result = await ctrl.createZ2MMessage(
            'zigbee2mqtt.0.0x0001.brightness',
            { val: 128, ack: false }
        );
        assert.ok(result);
        assert.strictEqual(result.topic, 'TestDevice/set');
        assert.strictEqual(result.payload.brightness, 128);
    });

    it('wendet setter auf den Wert an', async () => {
        const device = {
            id: 'TestDevice',
            ieee_address: '0x0002',
            optionsValues: {},
            states: [{
                id: 'state',
                write: true,
                type: 'boolean',
                setter: (v) => (v ? 'ON' : 'OFF'),
            }],
        };
        const { ctrl } = makeController([device]);
        const result = await ctrl.createZ2MMessage(
            'zigbee2mqtt.0.0x0002.state',
            { val: true, ack: false }
        );
        assert.ok(result);
        assert.strictEqual(result.payload.state, 'ON');
    });

    it('überspringt Nachricht wenn setter undefined zurückgibt', async () => {
        const device = {
            id: 'TestDevice',
            ieee_address: '0x0003',
            optionsValues: {},
            states: [{
                id: 'state_toggle',
                write: true,
                type: 'boolean',
                setattr: 'state',
                setter: (v) => (v ? 'TOGGLE' : undefined),
            }],
        };
        const { ctrl } = makeController([device]);
        const result = await ctrl.createZ2MMessage(
            'zigbee2mqtt.0.0x0003.state_toggle',
            { val: false, ack: false }
        );
        assert.strictEqual(result, undefined);
    });

    it('gibt Warnung bei setter-Exception aus und gibt undefined zurück', async () => {
        const device = {
            id: 'TestDevice',
            ieee_address: '0x0004',
            optionsValues: {},
            states: [{
                id: 'color',
                write: true,
                type: 'string',
                setter: () => { throw new Error('invalid color'); },
            }],
        };
        const { ctrl, adapter } = makeController([device]);
        const result = await ctrl.createZ2MMessage(
            'zigbee2mqtt.0.0x0004.color',
            { val: 'invalid', ack: false }
        );
        assert.strictEqual(result, undefined);
        assert.ok(adapter.logs.warn.some((m) => m.includes('setter error')));
    });

    it('gibt Warnung bei ungültigem send_payload JSON aus', async () => {
        const device = {
            id: 'TestDevice',
            ieee_address: '0x0005',
            optionsValues: {},
            states: [{ id: 'send_payload', write: true, type: 'string' }],
        };
        const { ctrl, adapter } = makeController([device]);
        const result = await ctrl.createZ2MMessage(
            'zigbee2mqtt.0.0x0005.send_payload',
            { val: '{ungültiges json', ack: false }
        );
        assert.strictEqual(result, undefined);
        assert.ok(adapter.logs.warn.some((m) => m.includes('not a valid JSON')));
    });

    it('parst send_payload als JSON wenn gültig', async () => {
        const device = {
            id: 'TestDevice',
            ieee_address: '0x0006',
            optionsValues: {},
            states: [{ id: 'send_payload', write: true, type: 'string' }],
        };
        const { ctrl } = makeController([device]);
        const result = await ctrl.createZ2MMessage(
            'zigbee2mqtt.0.0x0006.send_payload',
            { val: '{"color_temp":300}', ack: false }
        );
        assert.ok(result);
        assert.strictEqual(result.payload.color_temp, 300);
    });

    it('setzt isOption-State direkt als ack und gibt undefined zurück', async () => {
        const device = {
            id: 'TestDevice',
            ieee_address: '0x0007',
            optionsValues: {},
            states: [{ id: 'transition', write: true, type: 'number', isOption: true }],
        };
        const { ctrl, adapter } = makeController([device]);
        const result = await ctrl.createZ2MMessage(
            'zigbee2mqtt.0.0x0007.transition',
            { val: 0.5, ack: false }
        );
        assert.strictEqual(result, undefined);
        assert.ok(adapter.setStates.some((s) => s.id.endsWith('transition') && s.ack === true));
        assert.strictEqual(device.optionsValues.transition, 0.5);
    });
});

// ─── proxyZ2MLogs ────────────────────────────────────────────────────────────
describe('Z2mController.proxyZ2MLogs', () => {
    it('leitet error-Level ans adapter.log.error weiter', async () => {
        const adapter = makeAdapterMock();
        const ctrl = new Z2mController(adapter, [], [], { debugDevices: '', logfilter: [] });
        await ctrl.proxyZ2MLogs({ payload: { level: 'error', message: 'something broke' } });
        assert.ok(adapter.logs.error.some((m) => m.includes('something broke')));
    });

    it('filtert Nachrichten die im logfilter enthalten sind', async () => {
        const adapter = makeAdapterMock();
        const ctrl = new Z2mController(adapter, [], [], {
            debugDevices: '',
            logfilter: ['heartbeat'],
        });
        await ctrl.proxyZ2MLogs({ payload: { level: 'info', message: 'heartbeat ok' } });
        assert.strictEqual(adapter.logs.info.length, 0);
    });

    it('mappt Z2M "warning" auf adapter.log.warn', async () => {
        const adapter = makeAdapterMock();
        const ctrl = new Z2mController(adapter, [], [], { debugDevices: '', logfilter: [] });
        await ctrl.proxyZ2MLogs({ payload: { level: 'warning', message: 'low battery' } });
        assert.ok(adapter.logs.warn.some((m) => m.includes('low battery')));
    });

    it('verwendet debug für unbekannte Log-Level', async () => {
        const adapter = makeAdapterMock();
        const ctrl = new Z2mController(adapter, [], [], { debugDevices: '', logfilter: [] });
        await ctrl.proxyZ2MLogs({ payload: { level: 'verbose', message: 'verbose info' } });
        assert.ok(adapter.logs.debug.some((m) => m.includes('verbose info')));
    });

    it('bricht ohne Fehler ab bei fehlendem payload.message', async () => {
        const adapter = makeAdapterMock();
        const ctrl = new Z2mController(adapter, [], [], { debugDevices: '', logfilter: [] });
        await assert.doesNotReject(() => ctrl.proxyZ2MLogs({ payload: {} }));
    });
});
