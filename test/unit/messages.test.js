'use strict';

const assert = require('assert');
const { adapterInfo, zigbee2mqttInfo } = require('../../lib/messages');

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

describe('messages.adapterInfo', () => {
    it('bricht ohne Fehler ab wenn config/log null', async () => {
        await assert.doesNotReject(() => adapterInfo(null, null));
        await assert.doesNotReject(() => adapterInfo({}, null));
    });

    it('enthält keine Tippfehler "Externanl" mehr', async () => {
        const log = makeLogSpy();
        await adapterInfo({
            connectionType: 'exmqtt',
            externalMqttServerIP: '192.168.1.1',
            externalMqttServerPort: 1883,
            externalMqttServerCredentials: false,
        }, log);
        const allInfo = log.messages.info.join('\n');
        assert.ok(!allInfo.includes('Externanl'), 'Tippfehler "Externanl" gefunden!');
        assert.ok(allInfo.includes('External'), '"External" nicht gefunden!');
    });

    it('loggt WS-spezifische Konfiguration bei ws-Verbindung', async () => {
        const log = makeLogSpy();
        await adapterInfo({
            connectionType: 'ws',
            wsScheme: 'ws',
            wsServerIP: '127.0.0.1',
            wsServerPort: 8080,
            wsTokenEnabled: false,
            dummyMqtt: false,
        }, log);
        const allInfo = log.messages.info.join('\n');
        assert.ok(allInfo.includes('Websocket Server'));
    });

    it('loggt interne MQTT-Konfiguration bei intmqtt-Verbindung', async () => {
        const log = makeLogSpy();
        await adapterInfo({
            connectionType: 'intmqtt',
            mqttServerIPBind: '0.0.0.0',
            mqttServerPort: 1883,
        }, log);
        const allInfo = log.messages.info.join('\n');
        assert.ok(allInfo.includes('Internal MQTT'));
    });
});

describe('messages.zigbee2mqttInfo', () => {
    it('bricht ohne Fehler ab wenn payload/log null', async () => {
        await assert.doesNotReject(() => zigbee2mqttInfo(null, makeLogSpy()));
        await assert.doesNotReject(() => zigbee2mqttInfo({}, null));
    });

    it('loggt Version und Coordinator-Info', async () => {
        const log = makeLogSpy();
        await zigbee2mqttInfo({
            version: '1.37.1',
            coordinator: { type: 'zStack', meta: { revision: 20230507 } },
            config: { serial: { port: '/dev/ttyUSB0' } },
            network: { pan_id: 6754, channel: 15, extended_pan_id: '0x00124b0014d68e58' },
        }, log);
        const allInfo = log.messages.info.join('\n');
        assert.ok(allInfo.includes('1.37.1'));
        assert.ok(allInfo.includes('zStack'));
        assert.ok(allInfo.includes('/dev/ttyUSB0'));
    });

    it('verwendet "unknown" bei fehlenden Feldern', async () => {
        const log = makeLogSpy();
        await zigbee2mqttInfo({ version: '2.0.0' }, log);
        const allInfo = log.messages.info.join('\n');
        assert.ok(allInfo.includes('unknown'));
    });
});
