const core = require('@iobroker/adapter-core');
const Aedes = require('aedes');
const net = require('net');
let mqttServer;

class MqttServerController {
    constructor(adapter) {
        this.adapter = adapter;
    }

    async createMQTTServer() {
        try {
            const NedbPersistence = require('aedes-persistence-nedb');
            const db = new NedbPersistence({
                path: `${core.getAbsoluteInstanceDataDir(this.adapter)}/mqttData`,
                prefix: '',
            });
            // @ts-ignore
            const aedes = Aedes({ persistence: db });
            mqttServer = net.createServer(aedes.handle);
            mqttServer.listen(this.adapter.config.mqttServerPort, this.adapter.config.mqttServerIPBind, () => {
                this.adapter.log.info(
                    `Starting MQTT-Server on IP ${this.adapter.config.mqttServerIPBind} and Port ${this.adapter.config.mqttServerPort}`
                );
            });
        } catch (err) {
            this.adapter.log.error(err);
        }
    }

    async createDummyMQTTServer() {
        try {
            // @ts-ignore
            const aedes = Aedes();
            mqttServer = net.createServer(aedes.handle);
            mqttServer.listen(this.adapter.config.mqttServerPort, this.adapter.config.mqttServerIPBind, () => {
                this.adapter.log.info(
                    `Starting DummyMQTT-Server on IP ${this.adapter.config.mqttServerIPBind} and Port ${this.adapter.config.mqttServerPort}`
                );
            });
        } catch (err) {
            this.adapter.log.error(err);
        }
    }

    closeServer() {
        if (mqttServer && !mqttServer.closed()) {
            mqttServer.close();
        }
    }
}

module.exports = {
    MqttServerController,
};
