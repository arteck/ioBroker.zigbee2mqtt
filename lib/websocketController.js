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

	async initWsClient(server, port) {
		try {
			wsClient = new WebSocket(`ws://${server}:${port}/api`);

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

			wsClient.on('error', (err) => { this.adapter.debug(err); });

			return wsClient;
		} catch (err) {
			this.adapter.log.error(err);
		}
	}

	async send(message) {
		wsClient.send(message);
	}

	async sendPingToServer() {
		//this.logDebug('Send ping to server');
		wsClient.ping();
		ping = setTimeout(() => {
			this.sendPingToServer();
		}, wsHeartbeatIntervall);
	}

	async wsHeartbeat() {
		clearTimeout(pingTimeout);
		pingTimeout = setTimeout(() => {
			this.adapter.log.warn('Websocked connection timed out');
			wsClient.terminate();
		}, wsHeartbeatIntervall + 1000);
	}

	async autoRestart() {
		this.adapter.log.warn(`Start try again in ${restartTimeout / 1000} seconds...`);
		autoRestartTimeout = setTimeout(() => {
			this.adapter.onReady();
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