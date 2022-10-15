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
			wsClient = new WebSocket(`ws://${this.adapter.config.wsServerIP}:${this.adapter.config.wsServerPort}/api`);

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

			wsClient.on('message', () => { });

			wsClient.on('error', (err) => { this.adapter.log.debug(err); });

			return wsClient;
		} catch (err) {
			this.adapter.log.error(err);
		}
	}

	send(message) {
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
		}, wsHeartbeatIntervall + 1000);
	}

	async autoRestart() {
		this.adapter.log.warn(`Start try again in ${restartTimeout / 1000} seconds...`);
		autoRestartTimeout = setTimeout(() => {
			this.adapter.startWebsocket();
		}, restartTimeout);
	}

	async allTimerClear() {
		clearTimeout(pingTimeout);
		clearTimeout(ping);
		clearTimeout(autoRestartTimeout);
	}
}

module.exports = {
	WebsocketController
};
