const WebSocket = require('ws');
let wsClient;
const wsHeartbeatIntervall = 5000;
const restartTimeout = 1000;
let ping;
let pingTimeout;
let autoRestartTimeout;

class WebsocketController {
    constructor(adapter) {
        this.adapter = adapter;
    }

    initWsClient() {
        try {
            let wsURL = `${this.adapter.config.wsScheme}://${this.adapter.config.wsServerIP}:${this.adapter.config.wsServerPort}/api`;

            if (this.adapter.config.wsTokenEnabled == true) {
                wsURL += `?token=${this.adapter.config.wsToken}`;
            }

            wsClient = new WebSocket(wsURL, { rejectUnauthorized: false });

            wsClient.on('open', () => {
                // Send ping to server
                this.sendPingToServer();
                // Start Heartbeat
                this.wsHeartbeat();
            });

            wsClient.on('pong', () => {
                this.wsHeartbeat();
            });

            wsClient.on('close', async () => {
                clearTimeout(pingTimeout);
                clearTimeout(ping);

                if (wsClient.readyState === WebSocket.CLOSED) {
                    this.autoRestart();
                }
            });

            wsClient.on('message', () => {});

            wsClient.on('error', (err) => {
                this.adapter.log.debug(err);
            });

            return wsClient;
        } catch (err) {
            this.adapter.log.error(err);
        }
    }

    send(message) {
        if (wsClient.readyState !== WebSocket.OPEN) {
            this.adapter.log.warn('Cannot set State, no websocket connection to Zigbee2MQTT!');
            return;
        }
        wsClient.send(message);
    }

    sendPingToServer() {
        //this.logDebug('Send ping to server');
        wsClient.ping();
        ping = setTimeout(() => {
            this.sendPingToServer();
        }, wsHeartbeatIntervall);
    }

    wsHeartbeat() {
        clearTimeout(pingTimeout);
        pingTimeout = setTimeout(() => {
            this.adapter.log.warn('Websocked connection timed out');
            wsClient.terminate();
        }, wsHeartbeatIntervall + 3000);
    }

    async autoRestart() {
        this.adapter.log.warn(`Start try again in ${restartTimeout / 1000} seconds...`);
        autoRestartTimeout = setTimeout(() => {
            this.adapter.startWebsocket();
        }, restartTimeout);
    }

    closeConnection() {
        if (wsClient && wsClient.readyState !== WebSocket.CLOSED) {
            wsClient.close();
        }
    }

    async allTimerClear() {
        clearTimeout(pingTimeout);
        clearTimeout(ping);
        clearTimeout(autoRestartTimeout);
    }
}

module.exports = {
    WebsocketController,
};
