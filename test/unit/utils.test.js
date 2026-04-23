'use strict';

const assert = require('assert');
const utils = require('../../lib/utils');

describe('utils', () => {
    // ─── bulbLevelToAdapterLevel ────────────────────────────────────────────
    describe('bulbLevelToAdapterLevel', () => {
        it('gibt 0 zurück für Wert 0', () => {
            assert.strictEqual(utils.bulbLevelToAdapterLevel(0), 0);
        });
        it('gibt 0 zurück für Wert 1 (Grenzfall "aus")', () => {
            assert.strictEqual(utils.bulbLevelToAdapterLevel(1), 0);
        });
        it('gibt 1 zurück für Wert 2 (Minimum "an")', () => {
            assert.strictEqual(utils.bulbLevelToAdapterLevel(2), 1);
        });
        it('gibt 100 zurück für Wert 254 (Maximum)', () => {
            assert.strictEqual(utils.bulbLevelToAdapterLevel(254), 100);
        });
        it('gibt einen Wert im Bereich 1..100 für Mittelwert zurück', () => {
            const result = utils.bulbLevelToAdapterLevel(128);
            assert.ok(result >= 1 && result <= 100, `Erwartet 1..100, erhalten: ${result}`);
        });
    });

    // ─── adapterLevelToBulbLevel ────────────────────────────────────────────
    describe('adapterLevelToBulbLevel', () => {
        it('gibt 0 zurück für Wert 0', () => {
            assert.strictEqual(utils.adapterLevelToBulbLevel(0), 0);
        });
        it('gibt 0 zurück für null (kein Wert)', () => {
            assert.strictEqual(utils.adapterLevelToBulbLevel(null), 0);
        });
        it('gibt 2 zurück für Wert 1 (Minimum "an")', () => {
            assert.strictEqual(utils.adapterLevelToBulbLevel(1), 2);
        });
        it('gibt 254 zurück für Wert 100 (Maximum)', () => {
            assert.strictEqual(utils.adapterLevelToBulbLevel(100), 254);
        });
        it('Round-trip: bulb→adapter→bulb (Wert 128)', () => {
            const adp = utils.bulbLevelToAdapterLevel(128);
            const bulb = utils.adapterLevelToBulbLevel(adp);
            // Durch Rundung kann es ±1 Abweichung geben
            assert.ok(Math.abs(bulb - 128) <= 2, `Round-trip Abweichung zu groß: ${bulb} ≠ 128`);
        });
    });

    // ─── toMired ────────────────────────────────────────────────────────────
    describe('toMired', () => {
        it('gibt den Mired-Wert unverändert zurück wenn ≤ 1000', () => {
            assert.strictEqual(utils.toMired(500), 500);
        });
        it('wandelt Kelvin in Mired um wenn > 1000', () => {
            const result = utils.toMired(4000);
            assert.strictEqual(result, Math.round(1000000 / 4000));
        });
        it('Grenzfall 1000 → nicht konvertieren', () => {
            assert.strictEqual(utils.toMired(1000), 1000);
        });
        it('Grenzfall 1001 → wird als Kelvin behandelt', () => {
            const result = utils.toMired(1001);
            assert.strictEqual(result, Math.round(1000000 / 1001));
        });
    });

    // ─── miredKelvinConversion ───────────────────────────────────────────────
    describe('miredKelvinConversion', () => {
        it('rechnet Kelvin korrekt in Mired um', () => {
            assert.strictEqual(utils.miredKelvinConversion(6500), Math.round(1000000 / 6500));
        });
        it('ist eine Involutionsfunktion (f(f(t)) ≈ t)', () => {
            const t = 4000;
            const mired = utils.miredKelvinConversion(t);
            const kelvinBack = utils.miredKelvinConversion(mired);
            // Rundungsfehler erlauben
            assert.ok(Math.abs(kelvinBack - t) <= 5, `Involution verletzt: ${kelvinBack} ≠ ${t}`);
        });
    });

    // ─── decimalToHex ────────────────────────────────────────────────────────
    describe('decimalToHex', () => {
        it('gibt "ff" zurück für 255', () => {
            assert.strictEqual(utils.decimalToHex(255), 'ff');
        });
        it('gibt "00" zurück für 0 mit Standard-Padding 2', () => {
            assert.strictEqual(utils.decimalToHex(0), '00');
        });
        it('gibt "0a" zurück für 10', () => {
            assert.strictEqual(utils.decimalToHex(10), '0a');
        });
        it('respektiert individuelles Padding', () => {
            assert.strictEqual(utils.decimalToHex(255, 4), '00ff');
        });
    });

    // ─── clearArray ─────────────────────────────────────────────────────────
    describe('clearArray', () => {
        it('leert ein Array in-place', () => {
            const arr = [1, 2, 3];
            utils.clearArray(arr);
            assert.strictEqual(arr.length, 0);
        });
        it('funktioniert auf leerem Array', () => {
            const arr = [];
            utils.clearArray(arr);
            assert.strictEqual(arr.length, 0);
        });
        it('erhält die Referenz des Arrays', () => {
            const arr = [1, 2];
            const ref = arr;
            utils.clearArray(arr);
            assert.strictEqual(arr, ref);
        });
    });

    // ─── moveArray ───────────────────────────────────────────────────────────
    describe('moveArray', () => {
        it('verschiebt alle Elemente von source nach target', () => {
            const src = [1, 2, 3];
            const dst = [];
            utils.moveArray(src, dst);
            assert.deepStrictEqual(dst, [1, 2, 3]);
            assert.strictEqual(src.length, 0);
        });
        it('hängt an vorhandene Target-Elemente an', () => {
            const src = [3, 4];
            const dst = [1, 2];
            utils.moveArray(src, dst);
            assert.deepStrictEqual(dst, [1, 2, 3, 4]);
        });
    });

    // ─── isObject ────────────────────────────────────────────────────────────
    describe('isObject', () => {
        it('gibt true für normales Objekt zurück', () => {
            assert.strictEqual(utils.isObject({ a: 1 }), true);
        });
        it('gibt false für Array zurück', () => {
            assert.strictEqual(utils.isObject([1, 2]), false);
        });
        it('gibt false für null zurück', () => {
            assert.strictEqual(utils.isObject(null), false);
        });
        it('gibt false für String zurück', () => {
            assert.strictEqual(utils.isObject('hello'), false);
        });
        it('gibt false für Zahl zurück', () => {
            assert.strictEqual(utils.isObject(42), false);
        });
        it('gibt true für leeres Objekt zurück', () => {
            assert.strictEqual(utils.isObject({}), true);
        });
    });
});
