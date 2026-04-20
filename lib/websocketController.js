const WebSocket = require('ws');
const wsHeartbeatIntervall = 5000;
const restartTimeout = 1000;

/**
 *
 */
class WebsocketController {
    /**
     *
     * @param adapter
     */
    constructor(adapter) {
        this.adapter = adapter;
        this.wsClient = null;
        this.ping = null;
        this.pingTimeout = null;
        this.autoRestartTimeout = null;
    }

    /**
     *
     */
    initWsClient() {
        // Vorherige Verbindung sicher schließen und Timer stoppen
        clearTimeout(this.ping);
        clearTimeout(this.pingTimeout);
        clearTimeout(this.autoRestartTimeout);

        if (this.wsClient && this.wsClient.readyState !== WebSocket.CLOSED) {
            this.wsClient.removeAllListeners();
            this.wsClient.terminate();
            this.wsClient = null;
        }

        try {
            let wsURL = `${this.adapter.config.wsScheme}://${this.adapter.config.wsServerIP}:${this.adapter.config.wsServerPort}/api`;

            if (this.adapter.config.wsTokenEnabled === true) {
                wsURL += `?token=${this.adapter.config.wsToken}`;
            }

            this.wsClient = new WebSocket(wsURL, { rejectUnauthorized: false });

            this.wsClient.on('open', () => {
                this.adapter.log.info('Connect to Zigbee2MQTT over websocket connection.');
                this.sendPingToServer();
                this.wsHeartbeat();
            });

            this.wsClient.on('pong', () => {
                this.wsHeartbeat();
            });

            // Fix 1: ws@8 liefert Buffer, nicht String → immer .toString() verwenden
            this.wsClient.on('message', (message) => {
                let messageObj;
                try {
                    messageObj = JSON.parse(message.toString());
                } catch {
                    this.adapter.log.debug(`Invalid WebSocket message: ${message.toString().slice(0, 200)}`);
                    return;
                }
                // Fix 2: messageParse ist async – Fehler mit .catch() abfangen (fire & forget mit Fehlerhandling)
                this.adapter.messageParse(messageObj).catch((err) => {
                    this.adapter.log.error(`messageParse error: ${err}`);
                });
            });

            this.wsClient.on('close', async () => {
                clearTimeout(this.pingTimeout);
                clearTimeout(this.ping);
                try {
                    if (this.adapter.statesController) {
                        this.adapter.setStateChanged('info.connection', false, true);
                        await this.adapter.statesController.setAllAvailableToFalse();
                    }
                } catch (err) {
                    this.adapter.log.error(`close handler setAllAvailableToFalse error: ${err}`);
                }

                this.adapter.deviceCache.length = 0;
                this.adapter.groupCache.length = 0;
                for (const key of Object.keys(this.adapter.createCache)) {
                    delete this.adapter.createCache[key];
                }

                if (this.wsClient && this.wsClient.readyState === WebSocket.CLOSED) {
                    this.autoRestart();
                }
            });

            this.wsClient.on('error', (err) => {
                // Fix 4: err kann undefined sein oder kein Error-Objekt
                this.adapter.log.debug(`WebSocket error: ${err && err.message ? err.message : String(err || 'unknown')}`);
            });

        } catch (err) {
            this.adapter.log.error(`WebSocket init error: ${err}`);
        }
    }

    /**
     * @param message
     */
    send(message) {
        // Fix: null-Check vor readyState-Zugriff
        if (!this.wsClient || this.wsClient.readyState !== WebSocket.OPEN) {
            this.adapter.log.warn('Cannot set State, no websocket connection to Zigbee2MQTT!');
            return;
        }
        this.wsClient.send(message);
    }

    /**
     *
     */
    sendPingToServer() {
        if (!this.wsClient || this.wsClient.readyState !== WebSocket.OPEN) {
            return;
        }
        this.wsClient.ping();
        this.ping = setTimeout(() => {
            this.sendPingToServer();
        }, wsHeartbeatIntervall);
    }

    /**
     *
     */
    wsHeartbeat() {
        clearTimeout(this.pingTimeout);
        this.pingTimeout = setTimeout(() => {
            this.adapter.log.warn('WebSocket connection timed out');
            // Fix 5: terminate() kann werfen wenn wsClient in ungültigem Zustand
            try {
                if (this.wsClient) {
                    this.wsClient.terminate();
                }
            } catch (err) {
                this.adapter.log.debug(`wsHeartbeat terminate error: ${err}`);
            }
        }, wsHeartbeatIntervall + 3000);
    }

    /**
     *
     */
    autoRestart() {
        this.adapter.log.warn(`WebSocket disconnected – reconnecting in ${restartTimeout / 1000} seconds...`);
        clearTimeout(this.autoRestartTimeout);
        this.autoRestartTimeout = setTimeout(() => {
            try {
                this.initWsClient();
            } catch (err) {
                this.adapter.log.error(`autoRestart initWsClient error: ${err}`);
            }
        }, restartTimeout);
    }

    /**
     *
     */
    closeConnection() {
        if (this.wsClient && this.wsClient.readyState !== WebSocket.CLOSED) {
            this.wsClient.removeAllListeners();
            this.wsClient.close();
            this.wsClient = null;
        }
    }

    /**
     *
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
