const core = require('@iobroker/adapter-core');
const { Aedes } = require('aedes');
const net = require('node:net');
// Fix 1: kein Modul-globaler Zustand mehr – Instanz-Eigenschaften

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
        // Fix 1: Instanz-Eigenschaften statt Modul-global
        this.mqttServer = null;
        this.aedesBroker = null;
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
            this.aedesBroker = await Aedes.createBroker({ persistence: db });
            this.mqttServer = net.createServer(this.aedesBroker.handle);
            this.mqttServer.listen(this.adapter.config.mqttServerPort, this.adapter.config.mqttServerIPBind, () => {
                this.adapter.log.info(
                    `Starting MQTT-Server on IP ${this.adapter.config.mqttServerIPBind} and Port ${this.adapter.config.mqttServerPort}`
                );
            });
        } catch (err) {
            this.adapter.log.error(`createMQTTServer error: ${err}`);
        }
    }

    /**
     *
     */
    async createDummyMQTTServer() {
        try {
            this.aedesBroker = await Aedes.createBroker();
            this.mqttServer = net.createServer(this.aedesBroker.handle);
            this.mqttServer.listen(this.adapter.config.mqttServerPort, this.adapter.config.mqttServerIPBind, () => {
                this.adapter.log.info(
                    `Starting DummyMQTT-Server on IP ${this.adapter.config.mqttServerIPBind} and Port ${this.adapter.config.mqttServerPort}`
                );
            });
        } catch (err) {
            this.adapter.log.error(`createDummyMQTTServer error: ${err}`);
        }
    }

    /**
     *
     */
    closeServer() {
        // Fix 2: war: if (mqttServer && !mqttServer.close()) → close() gibt undefined zurück
        //         !undefined == true → close() wurde NIE aufgerufen!
        if (this.mqttServer) {
            try {
                this.mqttServer.close((err) => {
                    if (err) {
                        this.adapter.log.debug(`MQTT server close error: ${err.message}`);
                    }
                });
                this.mqttServer = null;
            } catch (err) {
                this.adapter.log.error(`closeServer mqttServer error: ${err}`);
            }
        }
        // Fix 3: Aedes-Broker ebenfalls schließen (sonst Port-Leak + Memory Leak)
        if (this.aedesBroker) {
            try {
                this.aedesBroker.close(() => {
                    this.adapter.log.debug('Aedes broker closed.');
                });
                this.aedesBroker = null;
            } catch (err) {
                this.adapter.log.error(`closeServer aedesBroker error: ${err}`);
            }
        }
    }
}

module.exports = {
    MqttServerController,
};
