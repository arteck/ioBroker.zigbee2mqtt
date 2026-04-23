'use strict';

const assert = require('assert');
const { checkConfig } = require('../../lib/check');

/**
 * Erzeugt einen einfachen Log-Spy
 */
function makeLogSpy() {
    const messages = { info: [], warn: [], error: [], debug: [] };
    return {
        messages,
        info:  (m) => messages.info.push(m),
        warn:  (m) => messages.warn.push(m),
        error: (m) => messages.error.push(m),
        debug: (m) => messages.debug.push(m),
    };
}

describe('checkConfig', () => {
    it('bricht bei fehlendem config/log ab ohne Fehler', () => {
        assert.doesNotThrow(() => checkConfig(null, null, '1.0.0'));
        assert.doesNotThrow(() => checkConfig({}, null, '1.0.0'));
        assert.doesNotThrow(() => checkConfig(null, makeLogSpy(), '1.0.0'));
    });

    it('gibt keinen Fehler bei korrekter Z2M-Konfiguration (v1)', () => {
        const log = makeLogSpy();
        const config = {
            advanced: {
                legacy_api: false,
                legacy_availability_payload: false,
                output: 'json',
            },
            device_options: { legacy: false },
        };
        checkConfig(config, log, '1.37.1');
        assert.strictEqual(log.messages.error.length, 0);
    });

    it('meldet legacy_api-Fehler bei Z2M v1 wenn aktiviert', () => {
        const log = makeLogSpy();
        const config = {
            advanced: {
                legacy_api: true,
                legacy_availability_payload: false,
                output: 'json',
            },
            device_options: { legacy: false },
        };
        checkConfig(config, log, '1.37.1');
        const errorText = log.messages.error.join(' ').toLowerCase();
        assert.ok(errorText.includes('legacy api'), `Erwartete Erwähnung von "legacy api", erhalten: ${errorText}`);
    });

    it('meldet legacy_availability_payload-Fehler bei Z2M v1', () => {
        const log = makeLogSpy();
        const config = {
            advanced: {
                legacy_api: false,
                legacy_availability_payload: true,
                output: 'json',
            },
            device_options: { legacy: false },
        };
        checkConfig(config, log, '1.2.0');
        const errorText = log.messages.error.join(' ');
        assert.ok(errorText.includes('Availability Payload'));
    });

    it('gibt keinen Fehler für v1-Probleme bei Z2M v2.x', () => {
        const log = makeLogSpy();
        // legacy_api und legacy_availability_payload sind bei v2+ irrelevant
        const config = {
            advanced: {
                legacy_api: true,
                legacy_availability_payload: true,
                output: 'json',
            },
            device_options: { legacy: true },
        };
        checkConfig(config, log, '2.0.0');
        const errorText = log.messages.error.join(' ');
        // v1-spezifische Fehler dürfen NICHT erscheinen
        assert.ok(!errorText.includes('legacy api'), 'v1-Fehler dürfen bei v2 nicht auftauchen');
    });

    it('meldet Fehler für falschen MQTT output-Typ (weder json noch attribute_and_json)', () => {
        const log = makeLogSpy();
        const config = {
            advanced: { output: 'attribute' },
        };
        checkConfig(config, log, '1.38.0');
        const errorText = log.messages.error.join(' ');
        assert.ok(errorText.includes('output type'), `Erwartete output-Fehlermeldung, erhalten: ${errorText}`);
    });

    it('gibt keinen Fehler für output="attribute_and_json"', () => {
        const log = makeLogSpy();
        const config = {
            advanced: {
                legacy_api: false,
                legacy_availability_payload: false,
                output: 'attribute_and_json',
            },
            device_options: { legacy: false },
        };
        checkConfig(config, log, '1.38.0');
        // Kein output-Fehler erwartet
        const hasOutputError = log.messages.error.some((m) => m.includes('output type'));
        assert.strictEqual(hasOutputError, false);
    });

    it('behandelt version=undefined ohne Crash', () => {
        const log = makeLogSpy();
        assert.doesNotThrow(() => checkConfig({ advanced: { output: 'json' } }, log, undefined));
    });
});
