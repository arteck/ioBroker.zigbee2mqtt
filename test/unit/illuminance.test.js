'use strict';

/**
 * Unit-Tests für die Illuminance-State-Verarbeitung.
 *
 * Getestete Fälle:
 *   Fall 1 – beide Werte im Payload (illuminance + illuminance_raw)
 *   Fall 2 – nur illuminance im Payload → illuminance_raw wird berechnet
 *   Fall 3 – nur illuminance_raw im Payload → illuminance (Lux) wird berechnet
 *
 * Getestete States (aus lib/states.js):
 *   illuminance_direct        (id=illuminance,     prop=illuminance,     kein getter)
 *   illuminance_raw_from_lux  (id=illuminance_raw, prop=illuminance,     getter)
 *   illuminance_raw_direct    (id=illuminance_raw, prop=illuminance_raw, kein getter)
 *   illuminance_from_raw      (id=illuminance,     prop=illuminance_raw, getter)
 *
 * Getestete expose-Fälle (aus lib/exposes.js createDeviceFromExposes):
 *   expose.name='illuminance'     → pushToStates(illuminance_direct) + illuminance_raw_from_lux
 *   expose.name='illuminance_raw' → pushToStates(illuminance_raw_direct) + illuminance_from_raw
 */

const assert = require('assert');
const { states: statesDefs } = require('../../lib/states');
const { createDeviceFromExposes } = require('../../lib/exposes');

// ---------------------------------------------------------------------------
// Hilfsfunktionen
// ---------------------------------------------------------------------------

/**
 * Baut eine minimale devicesMessag-Struktur für createDeviceFromExposes.
 *
 * @param {Array}  exposes  Array von Expose-Objekten
 * @param {string} [model]  Optionaler Geräte-Modell-String
 */
function makeDevice(exposes, model = 'TEST_MODEL') {
    return {
        friendly_name: 'test/device',
        ieee_address:  '0xTEST',
        power_source:  'DC Source',
        disabled:      false,
        description:   'Test device',
        endpoints:     {},
        definition: {
            model,
            exposes,
            options: [],
        },
    };
}

/**
 * Minimaler Adapter-Stub damit createDeviceFromExposes nicht wirft.
 */
const adapterStub = {
    config: {
        useKelvin:                   false,
        brightnessMoveOnOff:         false,
        brightnessStepOnOff:         false,
        colorTempSyncColor:          false,
        simpleHoldReleaseState:      false,
        simpleMoveStopState:         false,
        simplePressReleaseState:     false,
        allwaysUpdateAvailableState: false,
        allwaysUpdateOccupancyState: false,
    },
    log: { debug: () => {}, warn: () => {}, error: () => {}, info: () => {} },
};

/**
 * Findet einen State per id in einer States-Liste.
 *
 * @param {Array}  states
 * @param {string} id
 */
function findState(states, id) {
    return states.find((s) => s.id === id);
}

// ---------------------------------------------------------------------------
// Getter-Tests (Einheit: die getter-Funktionen in statesDefs)
// ---------------------------------------------------------------------------

describe('illuminance – statesDefs getter', () => {

    // ------------------------------------------------------------------
    // illuminance_raw_from_lux  (prop='illuminance')
    // ------------------------------------------------------------------
    describe('illuminance_raw_from_lux.getter', () => {
        const getter = statesDefs.illuminance_raw_from_lux.getter;

        it('Fall 1: gibt undefined zurück wenn illuminance_raw im Payload vorhanden ist', () => {
            const payload = { illuminance: 500, illuminance_raw: 27000 };
            assert.strictEqual(getter(payload), undefined,
                'illuminance_raw_direct soll den Rohwert setzen – kein Überschreiben durch diesen getter');
        });

        it('Fall 2: berechnet illuminance_raw aus illuminance (Lux)', () => {
            // raw = round(log10(lux) * 10000 + 1)
            const lux = 500;
            const expected = Math.round(Math.log10(lux) * 10000 + 1);
            const payload = { illuminance: lux };
            assert.strictEqual(getter(payload), expected);
        });

        it('Fall 2: illuminance = 0 → illuminance_raw = 0', () => {
            assert.strictEqual(getter({ illuminance: 0 }), 0);
        });

        it('Fall 2: illuminance = 1 Lux → korrekter Rohwert', () => {
            // log10(1) = 0 → raw = round(0 * 10000 + 1) = 1
            assert.strictEqual(getter({ illuminance: 1 }), 1);
        });

        it('Fall 2: illuminance = 10000 Lux → korrekter Rohwert', () => {
            // log10(10000) = 4 → raw = round(4 * 10000 + 1) = 40001
            assert.strictEqual(getter({ illuminance: 10000 }), 40001);
        });

        it('gibt undefined zurück wenn illuminance null/undefined ist', () => {
            assert.strictEqual(getter({ illuminance: null }),     undefined);
            assert.strictEqual(getter({ illuminance: undefined }), undefined);
            assert.strictEqual(getter({}),                         undefined);
        });
    });

    // ------------------------------------------------------------------
    // illuminance_from_raw  (prop='illuminance_raw')
    // ------------------------------------------------------------------
    describe('illuminance_from_raw.getter', () => {
        const getter = statesDefs.illuminance_from_raw.getter;

        it('Fall 1: gibt undefined zurück wenn illuminance im Payload vorhanden ist', () => {
            const payload = { illuminance: 500, illuminance_raw: 27000 };
            assert.strictEqual(getter(payload), undefined,
                'illuminance_direct soll den Lux-Wert setzen – kein Überschreiben durch diesen getter');
        });

        it('Fall 3: berechnet illuminance (Lux) aus illuminance_raw', () => {
            // lux = round(10^((raw - 1) / 10000))
            const raw = 27000;
            const expected = Math.round(Math.pow(10, (raw - 1) / 10000));
            const payload = { illuminance_raw: raw };
            assert.strictEqual(getter(payload), expected);
        });

        it('Fall 3: illuminance_raw = 0 → illuminance = 0', () => {
            assert.strictEqual(getter({ illuminance_raw: 0 }), 0);
        });

        it('Fall 3: illuminance_raw = 1 → illuminance = 1 Lux', () => {
            // 10^((1-1)/10000) = 10^0 = 1
            assert.strictEqual(getter({ illuminance_raw: 1 }), 1);
        });

        it('Fall 3: illuminance_raw = 10000 → illuminance = 10 Lux', () => {
            // 10^((10000-1)/10000) ≈ 10^0.9999 ≈ 9.998 → round → 10
            assert.strictEqual(getter({ illuminance_raw: 10000 }), 10);
        });

        it('Fall 3: illuminance_raw = 40000 → illuminance ≈ 10000 Lux (±2)', () => {
            // 10^((40000-1)/10000) = 10^3.9999 ≈ 9999.08 → round → 9999
            // Toleranz ±2 wegen Gleitkomma-Rundung
            const result = getter({ illuminance_raw: 40000 });
            assert.ok(result >= 9998 && result <= 10000, `Erwartet ~10000 (±2), erhalten: ${result}`);
        });

        it('gibt undefined zurück wenn illuminance_raw null/undefined ist', () => {
            assert.strictEqual(getter({ illuminance_raw: null }),     undefined);
            assert.strictEqual(getter({ illuminance_raw: undefined }), undefined);
            assert.strictEqual(getter({}),                             undefined);
        });
    });

    // ------------------------------------------------------------------
    // illuminance_direct – kein getter, direkter Wert
    // ------------------------------------------------------------------
    describe('illuminance_direct', () => {
        it('hat keinen getter (Wert wird direkt aus payload.illuminance übernommen)', () => {
            assert.strictEqual(statesDefs.illuminance_direct.getter, undefined);
        });

        it('prop ist "illuminance"', () => {
            assert.strictEqual(statesDefs.illuminance_direct.prop, 'illuminance');
        });

        it('id ist "illuminance"', () => {
            assert.strictEqual(statesDefs.illuminance_direct.id, 'illuminance');
        });

        it('unit ist "lux"', () => {
            assert.strictEqual(statesDefs.illuminance_direct.unit, 'lux');
        });
    });

    // ------------------------------------------------------------------
    // illuminance_raw_direct – kein getter, direkter Wert
    // ------------------------------------------------------------------
    describe('illuminance_raw_direct', () => {
        it('hat keinen getter (Wert wird direkt aus payload.illuminance_raw übernommen)', () => {
            assert.strictEqual(statesDefs.illuminance_raw_direct.getter, undefined);
        });

        it('prop ist "illuminance_raw"', () => {
            assert.strictEqual(statesDefs.illuminance_raw_direct.prop, 'illuminance_raw');
        });

        it('id ist "illuminance_raw"', () => {
            assert.strictEqual(statesDefs.illuminance_raw_direct.id, 'illuminance_raw');
        });
    });
});

// ---------------------------------------------------------------------------
// Integrations-Tests: createDeviceFromExposes erzeugt korrekte States
// ---------------------------------------------------------------------------

describe('illuminance – createDeviceFromExposes State-Registrierung', () => {

    // ------------------------------------------------------------------
    // expose.name = 'illuminance'
    // ------------------------------------------------------------------
    describe('expose.name = "illuminance"', () => {
        let deviceStates;

        before(async () => {
            const device = makeDevice([
                { type: 'numeric', name: 'illuminance', property: 'illuminance', access: 1 /* STATE */ },
            ]);
            const result = await createDeviceFromExposes(device, adapterStub);
            deviceStates = result.states;
        });

        it('registriert State mit id="illuminance" und prop="illuminance"', () => {
            const s = findState(deviceStates, 'illuminance');
            assert.ok(s, 'State illuminance muss vorhanden sein');
            assert.strictEqual(s.prop, 'illuminance');
        });

        it('registriert State mit id="illuminance_raw" und prop="illuminance"', () => {
            const s = findState(deviceStates, 'illuminance_raw');
            assert.ok(s, 'State illuminance_raw muss vorhanden sein');
            assert.strictEqual(s.prop, 'illuminance');
        });

        it('illuminance_raw hat einen getter der aus Lux zurückrechnet', () => {
            const s = findState(deviceStates, 'illuminance_raw');
            assert.strictEqual(typeof s.getter, 'function');
            // lux=100 → raw = round(log10(100)*10000+1) = round(2*10000+1) = 20001
            assert.strictEqual(s.getter({ illuminance: 100 }), 20001);
        });

        it('illuminance_raw getter gibt undefined wenn illuminance_raw schon im Payload', () => {
            const s = findState(deviceStates, 'illuminance_raw');
            assert.strictEqual(s.getter({ illuminance: 100, illuminance_raw: 20000 }), undefined);
        });
    });

    // ------------------------------------------------------------------
    // expose.name = 'illuminance_raw'
    // ------------------------------------------------------------------
    describe('expose.name = "illuminance_raw"', () => {
        let deviceStates;

        before(async () => {
            const device = makeDevice([
                { type: 'numeric', name: 'illuminance_raw', property: 'illuminance_raw', access: 1 },
            ]);
            const result = await createDeviceFromExposes(device, adapterStub);
            deviceStates = result.states;
        });

        it('registriert State mit id="illuminance_raw" und prop="illuminance_raw"', () => {
            const s = findState(deviceStates, 'illuminance_raw');
            assert.ok(s, 'State illuminance_raw muss vorhanden sein');
            assert.strictEqual(s.prop, 'illuminance_raw');
        });

        it('registriert State mit id="illuminance" und prop="illuminance_raw"', () => {
            const s = findState(deviceStates, 'illuminance');
            assert.ok(s, 'State illuminance muss vorhanden sein');
            assert.strictEqual(s.prop, 'illuminance_raw');
        });

        it('illuminance hat einen getter der Lux aus Rohwert berechnet', () => {
            const s = findState(deviceStates, 'illuminance');
            assert.strictEqual(typeof s.getter, 'function');
            // raw=20001 → lux = round(10^((20001-1)/10000)) = round(10^2) = 100
            assert.strictEqual(s.getter({ illuminance_raw: 20001 }), 100);
        });

        it('illuminance getter gibt undefined wenn illuminance schon im Payload', () => {
            const s = findState(deviceStates, 'illuminance');
            assert.strictEqual(s.getter({ illuminance_raw: 20000, illuminance: 100 }), undefined);
        });
    });

    // ------------------------------------------------------------------
    // expose.name = 'illuminance' + expose.name = 'illuminance_raw'
    // (beide Exposes gleichzeitig – Fall 1)
    // ------------------------------------------------------------------
    describe('expose.name = "illuminance" + "illuminance_raw" (beide vorhanden)', () => {
        let deviceStates;

        before(async () => {
            const device = makeDevice([
                { type: 'numeric', name: 'illuminance',     property: 'illuminance',     access: 1 },
                { type: 'numeric', name: 'illuminance_raw', property: 'illuminance_raw', access: 1 },
            ]);
            const result = await createDeviceFromExposes(device, adapterStub);
            deviceStates = result.states;
        });

        it('State illuminance ist vorhanden', () => {
            assert.ok(findState(deviceStates, 'illuminance'), 'illuminance muss vorhanden sein');
        });

        it('State illuminance_raw ist vorhanden', () => {
            assert.ok(findState(deviceStates, 'illuminance_raw'), 'illuminance_raw muss vorhanden sein');
        });

        it('Fall 1 – illuminance getter gibt undefined (illuminance_direct setzt direkt)', () => {
            const s = findState(deviceStates, 'illuminance');
            // Da zuerst illuminance_direct registriert wird (kein getter)
            // und dann illuminance_from_raw versucht wird (gleiche id='illuminance' → bereits vorhanden),
            // muss der getter des bereits registrierten States mit prop='illuminance' arbeiten.
            // illuminance_from_raw.getter gibt undefined wenn illuminance im Payload:
            if (s.getter) {
                assert.strictEqual(
                    s.getter({ illuminance: 500, illuminance_raw: 27000 }),
                    undefined,
                    'Wenn illuminance im Payload → illuminance_direct setzt direkt, getter=undefined'
                );
            }
            // Wenn kein getter → illuminance_direct wurde registriert (direkt übernehmen) ✅
        });

        it('Fall 1 – illuminance_raw getter gibt undefined (illuminance_raw_direct setzt direkt)', () => {
            const s = findState(deviceStates, 'illuminance_raw');
            if (s.getter) {
                assert.strictEqual(
                    s.getter({ illuminance: 500, illuminance_raw: 27000 }),
                    undefined,
                    'Wenn illuminance_raw im Payload → illuminance_raw_direct setzt direkt, getter=undefined'
                );
            }
        });
    });
});

// ---------------------------------------------------------------------------
// Mathematische Konsistenz: Hin- und Rückrechnung
// ---------------------------------------------------------------------------

describe('illuminance – Mathematische Konsistenz (round-trip)', () => {
    const rawGetter = statesDefs.illuminance_raw_from_lux.getter;
    const luxGetter = statesDefs.illuminance_from_raw.getter;

    const testValues = [
        { lux: 1,     rawApprox: 1     },
        { lux: 10,    rawApprox: 10001 },
        { lux: 100,   rawApprox: 20001 },
        { lux: 1000,  rawApprox: 30001 },
        { lux: 10000, rawApprox: 40001 },
    ];

    for (const { lux, rawApprox } of testValues) {
        it(`lux=${lux} → raw≈${rawApprox} → lux≈${lux} (round-trip)`, () => {
            // Lux → raw
            const raw = rawGetter({ illuminance: lux });
            assert.ok(typeof raw === 'number' && !isNaN(raw), `raw muss eine Zahl sein, erhalten: ${raw}`);
            // raw muss nahe am erwarteten Wert sein (±2 wegen Rundung)
            assert.ok(Math.abs(raw - rawApprox) <= 2, `raw=${raw} weicht zu stark von ${rawApprox} ab`);

            // raw → lux (Round-trip): Ergebnis muss nahe am Original-Lux sein (±1 wegen Rundung)
            const luxBack = luxGetter({ illuminance_raw: raw });
            assert.ok(Math.abs(luxBack - lux) <= 1, `round-trip lux=${luxBack} weicht zu stark von ${lux} ab`);
        });
    }

    it('raw=0 → lux=0 (Grenzfall)', () => {
        assert.strictEqual(luxGetter({ illuminance_raw: 0 }), 0);
    });

    it('lux=0 → raw=0 (Grenzfall)', () => {
        assert.strictEqual(rawGetter({ illuminance: 0 }), 0);
    });
});

// ---------------------------------------------------------------------------
// illuminance_lux – Geräte die illuminance_lux liefern (Philips HUE, IKEA)
// ---------------------------------------------------------------------------

describe('illuminance_lux – statesDefs getter', () => {

    describe('illuminance_lux_direct', () => {
        it('hat keinen getter (Wert direkt aus payload.illuminance_lux)', () => {
            assert.strictEqual(statesDefs.illuminance_lux_direct.getter, undefined);
        });
        it('prop ist "illuminance_lux"', () => {
            assert.strictEqual(statesDefs.illuminance_lux_direct.prop, 'illuminance_lux');
        });
        it('id ist "illuminance"', () => {
            assert.strictEqual(statesDefs.illuminance_lux_direct.id, 'illuminance');
        });
        it('unit ist "lux"', () => {
            assert.strictEqual(statesDefs.illuminance_lux_direct.unit, 'lux');
        });
    });

    describe('illuminance_raw_from_lux2.getter', () => {
        const getter = statesDefs.illuminance_raw_from_lux2.getter;

        it('gibt undefined wenn illuminance_raw schon im Payload', () => {
            assert.strictEqual(
                getter({ illuminance_lux: 500, illuminance_raw: 27000 }),
                undefined
            );
        });

        it('berechnet raw aus illuminance_lux=100 → 20001', () => {
            // raw = round(log10(100)*10000+1) = round(2*10000+1) = 20001
            assert.strictEqual(getter({ illuminance_lux: 100 }), 20001);
        });

        it('illuminance_lux = 0 → raw = 0', () => {
            assert.strictEqual(getter({ illuminance_lux: 0 }), 0);
        });

        it('illuminance_lux = 1 → raw = 1', () => {
            // log10(1)=0 → round(0*10000+1) = 1
            assert.strictEqual(getter({ illuminance_lux: 1 }), 1);
        });

        it('illuminance_lux = 10 → raw = 10001', () => {
            assert.strictEqual(getter({ illuminance_lux: 10 }), 10001);
        });

        it('illuminance_lux = 1000 → raw = 30001', () => {
            assert.strictEqual(getter({ illuminance_lux: 1000 }), 30001);
        });

        it('gibt undefined wenn illuminance_lux null/undefined', () => {
            assert.strictEqual(getter({ illuminance_lux: null }),      undefined);
            assert.strictEqual(getter({ illuminance_lux: undefined }), undefined);
            assert.strictEqual(getter({}),                              undefined);
        });

        it('round-trip: illuminance_lux=1000 → raw=30001 → lux≈1000', () => {
            const raw = getter({ illuminance_lux: 1000 });
            assert.strictEqual(raw, 30001);
            const luxBack = statesDefs.illuminance_from_raw.getter({ illuminance_raw: raw });
            assert.ok(Math.abs(luxBack - 1000) <= 1, `round-trip: ${luxBack} ≠ 1000`);
        });
    });
});

describe('illuminance_lux – createDeviceFromExposes State-Registrierung', () => {
    let deviceStates;

    before(async () => {
        const device = makeDevice([
            { type: 'numeric', name: 'illuminance_lux', property: 'illuminance_lux', access: 1 },
        ]);
        const result = await createDeviceFromExposes(device, adapterStub);
        deviceStates = result.states;
    });

    it('registriert State id="illuminance" mit prop="illuminance_lux"', () => {
        const s = findState(deviceStates, 'illuminance');
        assert.ok(s, 'illuminance State muss vorhanden sein');
        assert.strictEqual(s.prop, 'illuminance_lux');
    });

    it('registriert State id="illuminance_raw" mit prop="illuminance_lux"', () => {
        const s = findState(deviceStates, 'illuminance_raw');
        assert.ok(s, 'illuminance_raw State muss vorhanden sein');
        assert.strictEqual(s.prop, 'illuminance_lux');
    });

    it('illuminance_raw hat getter der raw aus Lux berechnet', () => {
        const s = findState(deviceStates, 'illuminance_raw');
        assert.strictEqual(typeof s.getter, 'function');
        assert.strictEqual(s.getter({ illuminance_lux: 100 }), 20001);
    });

    it('illuminance_raw getter gibt undefined wenn illuminance_raw im Payload', () => {
        const s = findState(deviceStates, 'illuminance_raw');
        assert.strictEqual(
            s.getter({ illuminance_lux: 100, illuminance_raw: 20000 }),
            undefined
        );
    });

    it('illuminance hat keinen getter (direkt übernehmen)', () => {
        const s = findState(deviceStates, 'illuminance');
        assert.strictEqual(s.getter, undefined);
    });
});

describe('illuminance_lux – alle 3 Properties gleichzeitig im Payload (Extremfall)', () => {
    const rawFromLux  = statesDefs.illuminance_raw_from_lux.getter;
    const rawFromLux2 = statesDefs.illuminance_raw_from_lux2.getter;
    const luxFromRaw  = statesDefs.illuminance_from_raw.getter;
    const payload = { illuminance: 500, illuminance_lux: 500, illuminance_raw: 27000 };

    it('illuminance_raw_from_lux gibt undefined (illuminance_raw im Payload)', () => {
        assert.strictEqual(rawFromLux(payload), undefined);
    });

    it('illuminance_raw_from_lux2 gibt undefined (illuminance_raw im Payload)', () => {
        assert.strictEqual(rawFromLux2(payload), undefined);
    });

    it('illuminance_from_raw gibt undefined (illuminance im Payload)', () => {
        assert.strictEqual(luxFromRaw(payload), undefined);
    });
});

