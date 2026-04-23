'use strict';

const assert = require('assert');
const { DeviceController } = require('../../lib/deviceController');

/**
 * Minimaler Adapter-Mock für Einheitstests
 */
function makeAdapterMock() {
    const logs = { info: [], warn: [], error: [], debug: [] };
    return {
        logs,
        log: {
            info:  (m) => logs.info.push(m),
            warn:  (m) => logs.warn.push(m),
            error: (m) => logs.error.push(m),
            debug: (m) => logs.debug.push(m),
        },
        config: {
            brightnessMoveOnOff: false,
            brightnessStepOnOff: false,
            useKelvin: false,
            colorTempSyncColor: false,
            useEventInDesc: false,
            useDeviceIcons: false,
        },
        name: 'zigbee2mqtt',
        instance: 0,
        namespace: 'zigbee2mqtt.0',
        // ioBroker-API-Stubs
        extendObjectAsync: async () => {},
        getDevicesAsync: async () => [],
        getForeignObjectsAsync: async () => ({}),
        delForeignObjectAsync: async () => {},
        setStateChangedAsync: async () => {},
    };
}

function makeController(adapterOverrides = {}) {
    const adapter = { ...makeAdapterMock(), ...adapterOverrides };
    const deviceCache = [];
    const groupCache  = [];
    const logCustomizations = { debugDevices: '', logfilter: [] };
    const createCache = {};
    return new DeviceController(adapter, deviceCache, groupCache, adapter.config, logCustomizations, createCache);
}

// ─── removeDeviceByIeee ──────────────────────────────────────────────────────
describe('DeviceController.removeDeviceByIeee', () => {
    it('entfernt das Gerät mit passender ieee_address', () => {
        const ctrl = makeController();
        const devices = [
            { ieee_address: '0x0001' },
            { ieee_address: '0x0002' },
        ];
        ctrl.removeDeviceByIeee(devices, '0x0001');
        assert.strictEqual(devices.length, 1);
        assert.strictEqual(devices[0].ieee_address, '0x0002');
    });

    it('lässt das Array unverändert wenn Adresse nicht gefunden', () => {
        const ctrl = makeController();
        const devices = [{ ieee_address: '0x0001' }];
        ctrl.removeDeviceByIeee(devices, '0xffff');
        assert.strictEqual(devices.length, 1);
    });

    it('entfernt aus leerem Array ohne Fehler', () => {
        const ctrl = makeController();
        assert.doesNotThrow(() => ctrl.removeDeviceByIeee([], '0x0001'));
    });
});

// ─── copyAndCleanStateObj ────────────────────────────────────────────────────
describe('DeviceController.copyAndCleanStateObj', () => {
    it('entfernt interne Felder (setter, getter, prop, …)', () => {
        const ctrl = makeController();
        const state = {
            id: 'brightness',
            name: 'Helligkeit',
            prop: 'brightness',
            setter: (v) => v,
            getter: (p) => p.brightness,
            setattr: 'brightness',
            isOption: false,
            options: ['transition'],
            isEvent: false,
            write: true,
            read: true,
            type: 'number',
        };
        const cleaned = ctrl.copyAndCleanStateObj(state);

        // Soll-Felder vorhanden
        assert.strictEqual(cleaned.id, 'brightness');
        assert.strictEqual(cleaned.name, 'Helligkeit');
        assert.strictEqual(cleaned.write, true);
        assert.strictEqual(cleaned.type, 'number');

        // Blacklisted Felder entfernt
        assert.strictEqual(cleaned.setter, undefined);
        assert.strictEqual(cleaned.getter, undefined);
        assert.strictEqual(cleaned.prop, undefined);
        assert.strictEqual(cleaned.setattr, undefined);
        assert.strictEqual(cleaned.isOption, undefined);
        assert.strictEqual(cleaned.options, undefined);
        assert.strictEqual(cleaned.isEvent, undefined);
    });

    it('lässt das Original-Objekt unverändert', () => {
        const ctrl = makeController();
        const state = { id: 'test', setter: () => {} };
        ctrl.copyAndCleanStateObj(state);
        assert.strictEqual(typeof state.setter, 'function');
    });
});

// ─── getDeviceName / getDeviceDescription ────────────────────────────────────
describe('DeviceController.getDeviceName', () => {
    it('gibt leeren String zurück wenn id === ieee_address (kein friendly_name)', () => {
        const ctrl = makeController();
        const device = { id: '0x0001', ieee_address: '0x0001' };
        assert.strictEqual(ctrl.getDeviceName(device), '');
    });

    it('gibt den friendly_name zurück wenn id !== ieee_address', () => {
        const ctrl = makeController();
        const device = { id: 'Wohnzimmer Lampe', ieee_address: '0x0001' };
        assert.strictEqual(ctrl.getDeviceName(device), 'Wohnzimmer Lampe');
    });
});

describe('DeviceController.getDeviceDescription', () => {
    it('gibt description zurück wenn vorhanden', () => {
        const ctrl = makeController();
        assert.strictEqual(ctrl.getDeviceDescription({ description: 'Tradfri Bulb' }), 'Tradfri Bulb');
    });

    it('gibt leeren String zurück wenn keine description', () => {
        const ctrl = makeController();
        assert.strictEqual(ctrl.getDeviceDescription({}), '');
    });
});

// ─── renameDeviceInCache ─────────────────────────────────────────────────────
describe('DeviceController.renameDeviceInCache', () => {
    it('umbenennt das Gerät in deviceCache', async () => {
        const ctrl = makeController();
        ctrl.deviceCache.push({ id: 'OldName', ieee_address: '0x0001', states: [] });
        await ctrl.renameDeviceInCache({
            payload: { data: { from: 'OldName', to: 'NewName' } },
        });
        assert.strictEqual(ctrl.deviceCache[0].id, 'NewName');
    });

    it('umbenennt das Gerät in groupCache', async () => {
        const ctrl = makeController();
        ctrl.groupCache.push({ id: 'OldGroup', ieee_address: 'group_1', states: [] });
        await ctrl.renameDeviceInCache({
            payload: { data: { from: 'OldGroup', to: 'NewGroup' } },
        });
        assert.strictEqual(ctrl.groupCache[0].id, 'NewGroup');
    });

    it('bricht ohne Fehler ab wenn payload fehlt', async () => {
        const ctrl = makeController();
        await assert.doesNotReject(() => ctrl.renameDeviceInCache({ payload: null }));
    });

    it('bricht ohne Fehler ab wenn from/to fehlen', async () => {
        const ctrl = makeController();
        await assert.doesNotReject(() =>
            ctrl.renameDeviceInCache({ payload: { data: { from: null, to: null } } })
        );
    });
});

// ─── createDeviceDefinitions ──────────────────────────────────────────────────
describe('DeviceController.createDeviceDefinitions', () => {
    it('gibt Warnung bei nicht-Array payload', async () => {
        const ctrl = makeController();
        await ctrl.createDeviceDefinitions(null);
        assert.ok(ctrl.adapter.logs.warn.some((m) => m.includes('kein Array')));
    });

    it('überspringt Einträge ohne ieee_address', async () => {
        const ctrl = makeController();
        await ctrl.createDeviceDefinitions([{ definition: null }, null]);
        assert.strictEqual(ctrl.deviceCache.length, 0);
    });

    it('überspringt Einträge ohne definition', async () => {
        const ctrl = makeController();
        await ctrl.createDeviceDefinitions([{ ieee_address: '0x0001', definition: null }]);
        assert.strictEqual(ctrl.deviceCache.length, 0);
    });
});

// ─── createGroupDefinitions ───────────────────────────────────────────────────
describe('DeviceController.createGroupDefinitions', () => {
    it('gibt Warnung bei nicht-Array payload', async () => {
        const ctrl = makeController();
        await ctrl.createGroupDefinitions('ungültig');
        assert.ok(ctrl.adapter.logs.warn.some((m) => m.includes('kein Array')));
    });

    it('überspringt Einträge ohne id oder friendly_name', async () => {
        const ctrl = makeController();
        await ctrl.createGroupDefinitions([{ id: null, friendly_name: 'Test' }]);
        assert.strictEqual(ctrl.groupCache.length, 0);
    });
});

// ─── processCoordinatorCheck ──────────────────────────────────────────────────
describe('DeviceController.processCoordinatorCheck', () => {
    it('setzt States und loggt Warnung bei missing_routers', async () => {
        const setStates = [];
        const adapter = {
            ...makeAdapterMock(),
            setStateAsync: async (id, val, ack) => setStates.push({ id, val, ack }),
        };
        adapter.config.coordinatorCheckLogLvl = 'warn';
        const ctrl = new DeviceController(adapter, [], [], adapter.config, { debugDevices: '' }, {});

        await ctrl.processCoordinatorCheck({
            data: { missing_routers: [{ ieee_address: '0xdead' }] },
        });

        assert.ok(setStates.some((s) => s.id === 'info.missing_routers'));
        assert.ok(setStates.some((s) => s.id === 'info.missing_routers_count'));
        assert.ok(adapter.logs.warn.length > 0);
    });

    it('loggt info wenn keine missing_routers', async () => {
        const setStates = [];
        const adapter = { ...makeAdapterMock(), setStateAsync: async (id, val, ack) => setStates.push({ id, val, ack }) };
        const ctrl = new DeviceController(adapter, [], [], adapter.config, { debugDevices: '' }, {});
        await ctrl.processCoordinatorCheck({ data: { missing_routers: [] } });
        assert.ok(adapter.logs.info.some((m) => m.includes('No missing router')));
    });
});
