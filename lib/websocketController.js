'use strict';

const WebSocket = require('ws');
const wsHeartbeatIntervall = 5000;
const restartTimeout = 1000;
/** Maximum reconnect delay in milliseconds (caps exponential backoff) */
const MAX_RESTART_TIMEOUT = 30000;

/**
 *
 */
class WebsocketController {
    /**
     * @param adapter
     */
    constructor(adapter) {
        this.adapter = adapter;
        this.wsClient  = null;
        this.ping      = null;
        this.pingTimeout      = null;
        this.autoRestartTimeout = null;
        // Flag: wird bei closeConnection() gesetzt damit autoRestart() nicht feuert
        this._intentionalClose = false;
        /** Aktueller Reconnect-Delay (exponentielles Backoff) */
        this._reconnectDelay = restartTimeout;
    }

    /**
     * Baut eine neue WebSocket-Verbindung auf.
     * Bestehende Verbindung und alle Timer werden zuerst sicher bereinigt.
     */
    initWsClient() {
        // Config-Guard: Pflichtfelder müssen vorhanden sein
        if (!this.adapter.config.wsScheme || !this.adapter.config.wsServerIP || !this.adapter.config.wsServerPort) {
            this.adapter.log.error('WebSocket config incomplete (wsScheme / wsServerIP / wsServerPort missing).');
            return;
        }

        this._intentionalClose = false;

        // Vorherige Timer stoppen
        clearTimeout(this.ping);
        clearTimeout(this.pingTimeout);
        clearTimeout(this.autoRestartTimeout);

        // Vorherige Verbindung sicher schließen und null setzen
        if (this.wsClient) {
            this.wsClient.removeAllListeners();
            if (this.wsClient.readyState !== WebSocket.CLOSED &&
                this.wsClient.readyState !== WebSocket.CLOSING) {
                try {
                    this.wsClient.terminate();
                } catch (e) {
                    this.adapter.log.debug(`initWsClient: old socket terminate error: ${e}`);
                }
            }
            this.wsClient = null;
        }

        try {
            let wsURL = `${this.adapter.config.wsScheme}://${this.adapter.config.wsServerIP}:${this.adapter.config.wsServerPort}/api`;
            // Für Logging: URL ohne Token (Sicherheit)
            const wsURLSafe = wsURL;

            if (this.adapter.config.wsTokenEnabled === true) {
                wsURL += `?token=${this.adapter.config.wsToken}`;
            }

            this.adapter.log.debug(`WebSocket connecting to ${wsURLSafe}`);
            this.wsClient = new WebSocket(wsURL, { rejectUnauthorized: false });

            this.wsClient.on('open', () => {
                this._reconnectDelay = restartTimeout; // Backoff zurücksetzen bei Erfolg
                this.adapter.log.info('Connect to Zigbee2MQTT over websocket connection.');
                this.sendPingToServer();
                this.wsHeartbeat();
            });

            this.wsClient.on('pong', () => {
                this.wsHeartbeat();
            });

            // ws@8 liefert Buffer, nicht String → immer .toString() verwenden
            this.wsClient.on('message', (message) => {
                let messageObj;
                try {
                    messageObj = JSON.parse(message.toString());
                } catch {
                    this.adapter.log.debug(`Invalid WebSocket message: ${message.toString().slice(0, 200)}`);
                    return;
                }
                // messageParse ist async – Fehler mit .catch() abfangen
                this.adapter.messageParse(messageObj).catch((err) => {
                    this.adapter.log.error(`messageParse error: ${err}`);
                });
            });

            this.wsClient.on('close', async (code, reason) => {
                clearTimeout(this.pingTimeout);
                clearTimeout(this.ping);

                this.adapter.log.debug(`WebSocket closed – code: ${code}, reason: ${reason ? reason.toString() : 'none'}`);

                try {
                    if (this.adapter.statesController) {
                        this.adapter.setStateChanged('info.connection', false, true);
                        await this.adapter.statesController.setAllAvailableToFalse();
                    }
                } catch (err) {
                    this.adapter.log.error(`close handler setAllAvailableToFalse error: ${err}`);
                }

                // Caches leeren
                this.adapter.deviceCache.length = 0;
                this.adapter.groupCache.length = 0;
                for (const key of Object.keys(this.adapter.createCache)) {
                    delete this.adapter.createCache[key];
                }

                // Nur reconnecten wenn kein intentionales Shutdown
                if (!this._intentionalClose) {
                    this.autoRestart();
                }
            });

            this.wsClient.on('error', (err) => {
                // err kann undefined sein oder kein Error-Objekt
                const msg = err && err.message ? err.message : String(err || 'unknown');
                this.adapter.log.debug(`WebSocket error: ${msg}`);
                // Kein throw – der 'close'-Event folgt nach 'error' immer automatisch
            });

        } catch (err) {
            this.adapter.log.error(`WebSocket init error: ${err}`);
            // Retry nach restartTimeout
            if (!this._intentionalClose) {
                this.autoRestart();
            }
        }
    }

    /**
     * Sendet eine Nachricht an Z2M.
     *
     * @param {string} message
     */
    send(message) {
        if (!this.wsClient || this.wsClient.readyState !== WebSocket.OPEN) {
            this.adapter.log.warn('Cannot set State, no websocket connection to Zigbee2MQTT!');
            return;
        }
        try {
            this.wsClient.send(message);
        } catch (err) {
            this.adapter.log.error(`WebSocket send error: ${err && err.message ? err.message : String(err)}`);
        }
    }

    /**
     * Sendet regelmäßig Pings an den Server.
     */
    sendPingToServer() {
        if (!this.wsClient || this.wsClient.readyState !== WebSocket.OPEN) {
            return;
        }
        try {
            this.wsClient.ping();
        } catch (err) {
            this.adapter.log.debug(`WebSocket ping error: ${err && err.message ? err.message : String(err)}`);
            return;
        }
        this.ping = setTimeout(() => {
            this.sendPingToServer();
        }, wsHeartbeatIntervall);
    }

    /**
     * Überwacht den Heartbeat. Wenn kein Pong innerhalb des Timeouts kommt, wird die Verbindung getrennt.
     */
    wsHeartbeat() {
        clearTimeout(this.pingTimeout);
        this.pingTimeout = setTimeout(() => {
            this.adapter.log.warn('WebSocket connection timed out – terminating.');
            try {
                if (this.wsClient) {
                    this.wsClient.terminate();
                }
            } catch (err) {
                this.adapter.log.debug(`wsHeartbeat terminate error: ${err}`);
            }
            // terminate() feuert 'close' → autoRestart() wird dort aufgerufen
        }, wsHeartbeatIntervall + 3000);
    }

    /**
     * Wartet kurz und baut dann die Verbindung neu auf (mit exponentiellem Backoff).
     */
    autoRestart() {
        const delay = this._reconnectDelay;
        this._reconnectDelay = Math.min(this._reconnectDelay * 2, MAX_RESTART_TIMEOUT);
        this.adapter.log.warn(`WebSocket disconnected – reconnecting in ${delay / 1000} second(s)...`);
        clearTimeout(this.autoRestartTimeout);
        this.autoRestartTimeout = setTimeout(() => {
            try {
                this.initWsClient();
            } catch (err) {
                this.adapter.log.error(`autoRestart initWsClient error: ${err}`);
            }
        }, delay);
    }

    /**
     * Schließt die Verbindung intentional (kein autoRestart).
     */
    closeConnection() {
        this._intentionalClose = true;
        this._reconnectDelay = restartTimeout; // Backoff zurücksetzen
        clearTimeout(this.ping);
        clearTimeout(this.pingTimeout);
        clearTimeout(this.autoRestartTimeout);
        if (this.wsClient) {
            this.wsClient.removeAllListeners();
            try {
                if (this.wsClient.readyState !== WebSocket.CLOSED &&
                    this.wsClient.readyState !== WebSocket.CLOSING) {
                    this.wsClient.close();
                }
            } catch (err) {
                this.adapter.log.debug(`closeConnection error: ${err}`);
            }
            this.wsClient = null;
        }
    }

    /**
     * Stoppt alle Timer (z.B. beim Adapter-Stop).
     */
    async allTimerClear() {
        clearTimeout(this.pingTimeout);
        clearTimeout(this.ping);
        clearTimeout(this.autoRestartTimeout);
    }
}

module.exports = {
    WebsocketController,
};
