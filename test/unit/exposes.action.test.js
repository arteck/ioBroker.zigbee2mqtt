'use strict';

/**
 * Unit-Tests für die Action-State-Erstellung und -Triggerung in exposes.js
 *
 * Getestete Actions (neue IKEA-Namenskonvention, Z2M ≥ 1.30):
 *   brightness_up_hold, brightness_down_hold    (früher: brightness_move_up/down)
 *   brightness_up_release, brightness_down_release (früher: brightness_stop)
 *   on, off, toggle
 *
 * Testet beide Adapter-Konfigurationen:
 *   1) simpleHoldReleaseState = true  → hold/release zu EINEM kombinierten State zusammengefasst
 *   2) simpleHoldReleaseState = false → jede Action als eigener Event-Button (250ms-Flash)
 */

const assert = require('assert');
const { createDeviceFromExposes } = require('../../lib/exposes');

// ─── Minimaler Adapter-Mock ───────────────────────────────────────────────────

function makeAdapterMock(configOverrides = {}) {
    return {
        log: {
            info:  () => {},
            warn:  () => {},
            error: () => {},
            debug: () => {},
        },
        config: {
            brightnessMoveOnOff:     false,
            brightnessStepOnOff:     false,
            useKelvin:               false,
            colorTempSyncColor:      false,
            simpleHoldReleaseState:  false,   // Standard: aus
            simpleMoveStopState:     false,
            simplePressReleaseState: false,
            useDeviceIcons:          false,
            ...configOverrides,
        },
    };
}

// ─── Typischer IKEA TRADFRI Remote E1743 Expose-Payload (neue Aktionsnamen) ─

/**
 * Erzeugt ein minimales bridge/devices-Objekt für einen IKEA-Remote
 * mit den neuen (Z2M ≥ 1.30) Aktionsnamen.
 *
 * @param {Array} actionValues  Liste der expose.values für die action-Expose
 * @returns {object}            Geräteobjekt für createDeviceFromExposes
 */
function makeIkeaDevice(actionValues) {
    return {
        friendly_name:  'test_remote',
        ieee_address:   '0xAABBCCDDEEFF0011',
        power_source:   'Battery',
        disabled:       false,
        description:    'IKEA TRADFRI remote',
        definition: {
            description: 'TRADFRI remote control',
            exposes: [
                {
                    type:     'enum',
                    name:     'action',
                    property: 'action',
                    access:   1,              // STATE
                    values:   actionValues,
                },
            ],
            options: [],
        },
        endpoints: {},
    };
}

// ─── Hilfsfunktion: Gerät anlegen und States-Map zurückgeben ─────────────────

async function getStates(actionValues, configOverrides = {}) {
    const adapter = makeAdapterMock(configOverrides);
    const device  = makeIkeaDevice(actionValues);
    const result  = await createDeviceFromExposes(device, adapter);
    // Gibt eine Map id → state zurück
    return Object.fromEntries(result.states.map((s) => [s.id, s]));
}

// =============================================================================
// 1) simpleHoldReleaseState = false (Standard)
//    Jede Action → eigener Event-Button mit isEvent=true, type='boolean', 250ms-Flash
// =============================================================================

describe('Action-States ohne simpleHoldReleaseState', () => {
    const VALUES = [
        'on', 'off', 'toggle',
        'brightness_up_hold',   'brightness_up_release',
        'brightness_down_hold', 'brightness_down_release',
    ];

    let states;
    before(async () => {
        states = await getStates(VALUES, { simpleHoldReleaseState: false });
    });

    // ── State-Erstellung ────────────────────────────────────────────────────

    it('legt action-State an (Typ string, isEvent)', () => {
        assert.ok(states['action'], 'action-State fehlt');
        assert.strictEqual(states['action'].type, 'string');
        assert.strictEqual(states['action'].isEvent, true);
    });

    it('legt brightness_up_hold als eigenen boolean-Button an', () => {
        const s = states['brightness_up_hold'];
        assert.ok(s,                           'brightness_up_hold fehlt');
        assert.strictEqual(s.type,   'boolean');
        assert.strictEqual(s.prop,   'action');
        assert.strictEqual(s.write,  false);
        assert.strictEqual(s.isEvent, true);
        assert.strictEqual(s.def,    false);
    });

    it('legt brightness_up_release als eigenen boolean-Button an', () => {
        const s = states['brightness_up_release'];
        assert.ok(s,                            'brightness_up_release fehlt');
        assert.strictEqual(s.type,    'boolean');
        assert.strictEqual(s.prop,    'action');
        assert.strictEqual(s.isEvent, true);
    });

    it('legt brightness_down_hold als eigenen boolean-Button an', () => {
        assert.ok(states['brightness_down_hold'],   'brightness_down_hold fehlt');
    });

    it('legt brightness_down_release als eigenen boolean-Button an', () => {
        assert.ok(states['brightness_down_release'], 'brightness_down_release fehlt');
    });

    it('legt on, off, toggle als eigene boolean-Buttons an', () => {
        assert.ok(states['on'],     'on-State fehlt');
        assert.ok(states['off'],    'off-State fehlt');
        assert.ok(states['toggle'], 'toggle-State fehlt');
    });

    // ── Getter-Triggerung ───────────────────────────────────────────────────

    it('brightness_up_hold getter → true bei action=brightness_up_hold', () => {
        const result = states['brightness_up_hold'].getter({ action: 'brightness_up_hold' });
        assert.strictEqual(result, true);
    });

    it('brightness_up_hold getter → undefined bei anderem action', () => {
        const result = states['brightness_up_hold'].getter({ action: 'brightness_up_release' });
        assert.strictEqual(result, undefined);
    });

    it('brightness_up_release getter → true bei action=brightness_up_release', () => {
        const result = states['brightness_up_release'].getter({ action: 'brightness_up_release' });
        assert.strictEqual(result, true);
    });

    it('brightness_down_hold getter → true bei action=brightness_down_hold', () => {
        const result = states['brightness_down_hold'].getter({ action: 'brightness_down_hold' });
        assert.strictEqual(result, true);
    });

    it('brightness_down_release getter → true bei action=brightness_down_release', () => {
        const result = states['brightness_down_release'].getter({ action: 'brightness_down_release' });
        assert.strictEqual(result, true);
    });

    it('on getter → true bei action=on', () => {
        assert.strictEqual(states['on'].getter({ action: 'on' }), true);
    });

    it('on getter → undefined bei action=off', () => {
        assert.strictEqual(states['on'].getter({ action: 'off' }), undefined);
    });

    it('off getter → true bei action=off', () => {
        assert.strictEqual(states['off'].getter({ action: 'off' }), true);
    });

    it('toggle getter → true bei action=toggle', () => {
        assert.strictEqual(states['toggle'].getter({ action: 'toggle' }), true);
    });

    it('on/off/toggle haben isEvent=true (→ 250ms-Flash im StatesController)', () => {
        assert.strictEqual(states['on'].isEvent,     true);
        assert.strictEqual(states['off'].isEvent,    true);
        assert.strictEqual(states['toggle'].isEvent, true);
    });

    it('action-Getter gibt payload.action zurück', () => {
        assert.strictEqual(states['action'].getter({ action: 'on' }),                  'on');
        assert.strictEqual(states['action'].getter({ action: 'brightness_up_hold' }), 'brightness_up_hold');
    });
});

// =============================================================================
// 2) simpleHoldReleaseState = true
//    hold+release → EINEM kombinierten State (hold=true, release=false)
//    release-State wird übersprungen (kein eigener State)
// =============================================================================

describe('Action-States mit simpleHoldReleaseState = true', () => {
    const VALUES = [
        'on', 'off', 'toggle',
        'brightness_up_hold',   'brightness_up_release',
        'brightness_down_hold', 'brightness_down_release',
    ];

    let states;
    before(async () => {
        states = await getStates(VALUES, { simpleHoldReleaseState: true });
    });

    // ── State-Erstellung ────────────────────────────────────────────────────

    it('brightness_up_hold-State wird angelegt', () => {
        assert.ok(states['brightness_up_hold'], 'brightness_up_hold fehlt');
    });

    it('brightness_up_release wird NICHT als eigener State angelegt (wird übersprungen)', () => {
        assert.strictEqual(
            states['brightness_up_release'],
            undefined,
            'brightness_up_release darf kein eigener State sein wenn simpleHoldReleaseState=true'
        );
    });

    it('brightness_down_hold-State wird angelegt', () => {
        assert.ok(states['brightness_down_hold'], 'brightness_down_hold fehlt');
    });

    it('brightness_down_release wird NICHT als eigener State angelegt', () => {
        assert.strictEqual(states['brightness_down_release'], undefined);
    });

    it('on, off, toggle werden weiterhin als eigene States angelegt', () => {
        assert.ok(states['on'],     'on fehlt');
        assert.ok(states['off'],    'off fehlt');
        assert.ok(states['toggle'], 'toggle fehlt');
    });

    // ── Getter-Triggerung ───────────────────────────────────────────────────

    it('brightness_up_hold getter → true bei action=brightness_up_hold (Taste gedrückt)', () => {
        const result = states['brightness_up_hold'].getter({ action: 'brightness_up_hold' });
        assert.strictEqual(result, true, 'Hold-Action muss true liefern');
    });

    it('brightness_up_hold getter → false bei action=brightness_up_release (Taste losgelassen)', () => {
        const result = states['brightness_up_hold'].getter({ action: 'brightness_up_release' });
        assert.strictEqual(result, false, 'Release-Action muss false liefern (kein separater State)');
    });

    it('brightness_up_hold getter → undefined bei fremder action', () => {
        const result = states['brightness_up_hold'].getter({ action: 'on' });
        assert.strictEqual(result, undefined);
    });

    it('brightness_down_hold getter → true bei action=brightness_down_hold', () => {
        const result = states['brightness_down_hold'].getter({ action: 'brightness_down_hold' });
        assert.strictEqual(result, true);
    });

    it('brightness_down_hold getter → false bei action=brightness_down_release', () => {
        const result = states['brightness_down_hold'].getter({ action: 'brightness_down_release' });
        assert.strictEqual(result, false);
    });

    it('brightness_down_hold getter → undefined bei brightness_up_hold', () => {
        const result = states['brightness_down_hold'].getter({ action: 'brightness_up_hold' });
        assert.strictEqual(result, undefined, 'Up-Hold darf nicht den Down-State triggern');
    });

    it('on getter bleibt unverändert: true bei on, undefined bei anderen', () => {
        assert.strictEqual(states['on'].getter({ action: 'on' }),     true);
        assert.strictEqual(states['on'].getter({ action: 'off' }),    undefined);
        assert.strictEqual(states['on'].getter({ action: 'toggle' }), undefined);
    });

    it('toggle_hold ohne Release-Partner fällt in else-Block → eigener Event-Button', async () => {
        // toggle_hold hat KEIN toggle_release → kein kombinierter State
        const s = await getStates(
            ['toggle_hold', 'brightness_up_hold', 'brightness_up_release'],
            { simpleHoldReleaseState: true }
        );
        assert.ok(s['toggle_hold'],                             'toggle_hold fehlt');
        assert.strictEqual(s['toggle_hold'].getter({ action: 'toggle_hold' }), true);
        // kein toggle_release-State
        assert.strictEqual(s['toggle_release'], undefined);
    });
});

// =============================================================================
// 3) Gemischter Payload: alte Namen + neue Namen zusammen
//    (Fallback-Szenario für Geräte die noch alte Namen liefern)
// =============================================================================

describe('Gemischte alte und neue Action-Namen', () => {
    it('brightness_move_up (alt) → eigener boolean-Button', async () => {
        const states = await getStates(
            ['brightness_move_up', 'brightness_move_down', 'brightness_stop'],
            { simpleHoldReleaseState: false }
        );
        assert.ok(states['brightness_move_up'],   'brightness_move_up fehlt');
        assert.ok(states['brightness_move_down'],  'brightness_move_down fehlt');
        assert.ok(states['brightness_stop'],       'brightness_stop fehlt');
    });

    it('brightness_stop mit simpleMoveStopState=true → kein eigener State', async () => {
        const states = await getStates(
            ['brightness_move_up', 'brightness_move_down', 'brightness_stop'],
            { simpleMoveStopState: true }
        );
        assert.strictEqual(
            states['brightness_stop'],
            undefined,
            'brightness_stop darf kein eigener State sein wenn simpleMoveStopState=true'
        );
    });

    it('brightness_move_up mit simpleMoveStopState=true → kombinierter State (true=move, false=stop)', async () => {
        const states = await getStates(
            ['brightness_move_up', 'brightness_move_down', 'brightness_stop'],
            { simpleMoveStopState: true }
        );
        const s = states['brightness_move_up'];
        assert.ok(s, 'brightness_move_up fehlt');
        assert.strictEqual(s.getter({ action: 'brightness_move_up' }), true,       'move → true');
        assert.strictEqual(s.getter({ action: 'brightness_stop' }),    false,      'stop → false');
        assert.strictEqual(s.getter({ action: 'on' }),                 undefined,  'andere → undefined');
    });
});

// =============================================================================
// 4) Edge-Cases
// =============================================================================

describe('Action-States Edge-Cases', () => {
    it('leere values → keine Action-States außer den Standard-States', async () => {
        const states = await getStates([]);
        assert.ok(states['action'], 'action-State soll immer angelegt werden');
        // Standard-States die immer angelegt werden
        const ALWAYS_PRESENT = new Set(['action', 'available', 'last_seen', 'send_payload']);
        const unexpectedIds = Object.keys(states).filter((id) => !ALWAYS_PRESENT.has(id));
        assert.strictEqual(unexpectedIds.length, 0, `Unerwartete States: ${unexpectedIds}`);
    });

    it('action-Getter gibt payload.action für jeden Wert korrekt zurück', async () => {
        const values = ['on', 'off', 'toggle', 'brightness_up_hold', 'brightness_down_hold'];
        const states = await getStates(values);
        for (const v of values) {
            assert.strictEqual(
                states['action'].getter({ action: v }),
                v,
                `action-Getter soll "${v}" zurückgeben`
            );
        }
    });

    it('unbekannte action im getter → undefined für alle Einzel-States', async () => {
        const states = await getStates(['on', 'brightness_up_hold', 'brightness_up_release']);
        const unknownPayload = { action: 'xyz_unknown' };
        assert.strictEqual(states['on'].getter(unknownPayload),                  undefined);
        assert.strictEqual(states['brightness_up_hold'].getter(unknownPayload),  undefined);
        assert.strictEqual(states['brightness_up_release'].getter(unknownPayload), undefined);
    });

    it('brightness_up_hold und brightness_down_hold triggern sich gegenseitig NICHT', async () => {
        const states = await getStates(
            ['brightness_up_hold', 'brightness_up_release', 'brightness_down_hold', 'brightness_down_release'],
            { simpleHoldReleaseState: true }
        );
        // Up-Hold darf bei Down-Hold-Action nicht anspringen
        assert.strictEqual(states['brightness_up_hold'].getter({ action: 'brightness_down_hold' }),   undefined);
        // Down-Hold darf bei Up-Hold-Action nicht anspringen
        assert.strictEqual(states['brightness_down_hold'].getter({ action: 'brightness_up_hold' }),   undefined);
        // Up-Hold darf bei Down-Release nicht auf false springen
        assert.strictEqual(states['brightness_up_hold'].getter({ action: 'brightness_down_release' }), undefined);
    });

    it('action-State hat prop=undefined und nutzt getter für string-Payload', async () => {
        const states = await getStates(['on']);
        const actionState = states['action'];
        // action-State ist ein string-State (kein prop nötig, getter direkt)
        assert.strictEqual(actionState.type, 'string');
        assert.strictEqual(actionState.getter({ action: 'on' }), 'on');
        assert.strictEqual(actionState.getter({ action: null }), null);
    });
});
