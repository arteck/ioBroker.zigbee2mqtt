'use strict';

const assert = require('assert');
const { WebsocketController } = require('../../lib/websocketController');

/**
 * Minimaler Adapter-Mock für WebsocketController-Tests.
 * Wir testen nur die Nicht-Netzwerk-Logik.
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
            wsScheme: 'ws',
            wsServerIP: '127.0.0.1',
            wsServerPort: 8080,
            wsTokenEnabled: false,
            wsToken: '',
        },
        deviceCache:  [],
        groupCache:   [],
        createCache:  {},
        statesController: null,
        setStateChanged: () => {},
        messageParse: async () => {},
        // ioBroker-Timer-API
        setTimeout:   (fn, ms) => setTimeout(fn, ms),
        clearTimeout: (handle) => clearTimeout(handle),
    };
}

// ─── send ────────────────────────────────────────────────────────────────────
describe('WebsocketController.send', () => {
    it('loggt Warnung wenn kein wsClient vorhanden', () => {
        const adapter = makeAdapterMock();
        const ctrl = new WebsocketController(adapter);
        ctrl.send('{"test":1}');
        assert.ok(adapter.logs.warn.some((m) => m.includes('no websocket connection')));
    });

    it('loggt Warnung wenn wsClient nicht OPEN ist', () => {
        const adapter = makeAdapterMock();
        const ctrl = new WebsocketController(adapter);
        ctrl.wsClient = { readyState: 0 /* CONNECTING */ };
        ctrl.send('{"test":1}');
        assert.ok(adapter.logs.warn.some((m) => m.includes('no websocket connection')));
    });
});

// ─── closeConnection ─────────────────────────────────────────────────────────
describe('WebsocketController.closeConnection', () => {
    it('setzt _intentionalClose=true und wsClient=null', () => {
        const adapter = makeAdapterMock();
        const ctrl = new WebsocketController(adapter);
        // Mock wsClient mit readyState OPEN (1)
        ctrl.wsClient = {
            readyState: 1,
            removeAllListeners: () => {},
            close: () => {},
        };
        ctrl.closeConnection();
        assert.strictEqual(ctrl._intentionalClose, true);
        assert.strictEqual(ctrl.wsClient, null);
    });

    it('setzt _reconnectDelay zurück auf Startwert', () => {
        const adapter = makeAdapterMock();
        const ctrl = new WebsocketController(adapter);
        ctrl._reconnectDelay = 16000; // simuliertes Backoff
        ctrl.closeConnection();
        assert.strictEqual(ctrl._reconnectDelay, 1000);
    });
});

// ─── allTimerClear ────────────────────────────────────────────────────────────
describe('WebsocketController.allTimerClear', () => {
    it('löscht alle internen Timer ohne Fehler', () => {
        const adapter = makeAdapterMock();
        const ctrl = new WebsocketController(adapter);
        ctrl.ping            = adapter.setTimeout(() => {}, 10000);
        ctrl.pingTimeout     = adapter.setTimeout(() => {}, 10000);
        ctrl.autoRestartTimeout = adapter.setTimeout(() => {}, 10000);
        assert.doesNotThrow(() => ctrl.allTimerClear());
    });
});

// ─── autoRestart – exponentielles Backoff ────────────────────────────────────
describe('WebsocketController.autoRestart (Backoff)', () => {
    it('verdoppelt den Reconnect-Delay nach jedem Aufruf', () => {
        const adapter = makeAdapterMock();
        const ctrl = new WebsocketController(adapter);

        // initWsClient mocken damit kein echter WS aufgebaut wird
        ctrl.initWsClient = () => {};

        const delay1 = ctrl._reconnectDelay; // 1000
        ctrl.autoRestart();
        const delay2 = ctrl._reconnectDelay; // 2000

        ctrl.autoRestart();
        const delay3 = ctrl._reconnectDelay; // 4000

        assert.strictEqual(delay1, 1000);
        assert.strictEqual(delay2, 2000);
        assert.strictEqual(delay3, 4000);
    });

    it('begrenzt Delay auf MAX_RESTART_TIMEOUT (30 s)', () => {
        const adapter = makeAdapterMock();
        const ctrl = new WebsocketController(adapter);
        ctrl.initWsClient = () => {};

        // Viele Fehlversuche simulieren
        for (let i = 0; i < 20; i++) {
            ctrl.autoRestart();
        }
        assert.ok(ctrl._reconnectDelay <= 30000, `Delay ${ctrl._reconnectDelay} überschreitet 30 000 ms`);
    });
});

// ─── initWsClient – Config-Guard ─────────────────────────────────────────────
describe('WebsocketController.initWsClient (Config-Guard)', () => {
    it('loggt Fehler und kehrt zurück wenn wsServerIP fehlt', () => {
        const adapter = makeAdapterMock();
        adapter.config.wsServerIP = '';
        const ctrl = new WebsocketController(adapter);
        ctrl.initWsClient(); // soll nicht werfen
        assert.ok(adapter.logs.error.some((m) => m.includes('config incomplete')));
    });
});
