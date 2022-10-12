const core = require('@iobroker/adapter-core');
const Aedes = require('aedes');
const net = require('net');


class MqttServerController {
	constructor(adapter) {
		this.adapter = adapter;
	}

	async createMQTTServer() {
		const NedbPersistence = require('aedes-persistence-nedb');
		const db = new NedbPersistence({ path: `${core.getAbsoluteInstanceDataDir(this.adapter)}/mqttData`, prefix: '' });
		// @ts-ignore
		const aedes = Aedes({ persistence: db });
		const mqttServer = net.createServer(aedes.handle);
		mqttServer.listen(this.adapter.config.mqttServerPort, this.adapter.config.mqttServerIPBind, () => {
			this.adapter.log.info(`Statring MQTT-Server on IP ${this.adapter.config.mqttServerIPBind} and Port ${this.adapter.config.mqttServerPort}`);
		});
	}

	async createDummyMQTTServer() {
		// @ts-ignore
		const aedes = Aedes();
		const mqttServer = net.createServer(aedes.handle);
		mqttServer.listen(this.adapter.config.mqttServerPort, this.adapter.config.mqttServerIPBind, () => {
			this.adapter.log.info(`Statring DummyMQTT-Server on IP ${this.adapter.config.mqttServerIPBind} and Port ${this.adapter.config.mqttServerPort}`);
		});
	}
}

module.exports = {
	MqttServerController
};