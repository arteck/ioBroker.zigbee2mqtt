const core = require('@iobroker/adapter-core');
const { Aedes } = require('aedes');
const net = require('node:net');
let mqttServer;

/**
 *
 */
class MqttServerController {
    /**
     *
     * @param adapter
     */
    constructor(adapter) {
        this.adapter = adapter;
    }

    /**
     *
     */
    async createMQTTServer() {
        try {
            const NedbPersistence = require('aedes-persistence-nedb');
            const db = new NedbPersistence({
                path: `${core.getAbsoluteInstanceDataDir(this.adapter)}/mqttData`,
                prefix: '',
            });
            // aedes-persistence-nedb does not implement the async setup() interface
            // required by aedes v1.x, so we add a no-op async shim for compatibility
            if (!db.setup) {
                db.setup = async () => {};
            }
            const aedes = await Aedes.createBroker({ persistence: db });
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

    /**
     *
     */
    async createDummyMQTTServer() {
        try {
            const aedes = await Aedes.createBroker();
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

    /**
     *
     */
    closeServer() {
        if (mqttServer && !mqttServer.close()) {
            mqttServer.close();
        }
    }
}

module.exports = {
    MqttServerController,
};
