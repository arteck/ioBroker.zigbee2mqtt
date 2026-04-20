'use strict';

const core = require('@iobroker/adapter-core');
const { Aedes } = require('aedes');
const net = require('node:net');

/**
 *
 */
class MqttServerController {
    /**
     * @param adapter
     */
    constructor(adapter) {
        this.adapter     = adapter;
        this.mqttServer  = null;
        this.aedesBroker = null;
    }

    /**
     * Prüft ob Port und Bind-Adresse konfiguriert sind.
     *
     * @returns {boolean}
     */
    _checkConfig() {
        if (!this.adapter.config.mqttServerPort || !this.adapter.config.mqttServerIPBind) {
            this.adapter.log.error('MQTT server config incomplete (mqttServerPort / mqttServerIPBind missing).');
            return false;
        }
        return true;
    }

    /**
     * Hängt error- und close-Events an einen net.Server.
     *
     * @param {string} label
     */
    _attachServerEvents(label) {
        if (!this.mqttServer) {
            return;
        }
        this.mqttServer.on('error', (err) => {
            this.adapter.log.error(`${label} error: ${err && err.message ? err.message : String(err)}`);
        });
        this.mqttServer.on('close', () => {
            this.adapter.log.debug(`${label} closed.`);
        });
    }

    /**
     * Startet den internen MQTT-Server mit Persistenz (aedes + nedb).
     */
    async createMQTTServer() {
        if (!this._checkConfig()) {
            return;
        }
        try {
            const NedbPersistence = require('aedes-persistence-nedb');
            const db = new NedbPersistence({
                path: `${core.getAbsoluteInstanceDataDir(this.adapter)}/mqttData`,
                prefix: '',
            });
            // aedes-persistence-nedb does not implement the async setup() interface
            // required by aedes v1.x → no-op shim
            if (!db.setup) {
                db.setup = async () => {};
            }
            this.aedesBroker = await Aedes.createBroker({ persistence: db });
            this.mqttServer  = net.createServer(this.aedesBroker.handle);
            this._attachServerEvents('MQTT-Server');

            await new Promise((resolve, reject) => {
                this.mqttServer.listen(
                    this.adapter.config.mqttServerPort,
                    this.adapter.config.mqttServerIPBind,
                    () => {
                        this.adapter.log.info(
                            `Starting MQTT-Server on IP ${this.adapter.config.mqttServerIPBind} and Port ${this.adapter.config.mqttServerPort}`
                        );
                        resolve();
                    }
                );
                this.mqttServer.once('error', reject);
            });
        } catch (err) {
            this.adapter.log.error(`createMQTTServer error: ${err && err.message ? err.message : String(err)}`);
            // Sicherstellen dass kein halboffener Server übrig bleibt
            this.closeServer();
        }
    }

    /**
     * Startet einen Dummy-MQTT-Server ohne Persistenz (für WS-Modus).
     */
    async createDummyMQTTServer() {
        if (!this._checkConfig()) {
            return;
        }
        try {
            this.aedesBroker = await Aedes.createBroker();
            this.mqttServer  = net.createServer(this.aedesBroker.handle);
            this._attachServerEvents('DummyMQTT-Server');

            await new Promise((resolve, reject) => {
                this.mqttServer.listen(
                    this.adapter.config.mqttServerPort,
                    this.adapter.config.mqttServerIPBind,
                    () => {
                        this.adapter.log.info(
                            `Starting DummyMQTT-Server on IP ${this.adapter.config.mqttServerIPBind} and Port ${this.adapter.config.mqttServerPort}`
                        );
                        resolve();
                    }
                );
                this.mqttServer.once('error', reject);
            });
        } catch (err) {
            this.adapter.log.error(`createDummyMQTTServer error: ${err && err.message ? err.message : String(err)}`);
            this.closeServer();
        }
    }

    /**
     * Schließt den MQTT-Server und den Aedes-Broker.
     */
    closeServer() {
        if (this.mqttServer) {
            const server = this.mqttServer;
            this.mqttServer = null;
            try {
                server.close((err) => {
                    if (err) {
                        this.adapter.log.debug(`MQTT server close callback error: ${err.message}`);
                    }
                });
            } catch (err) {
                this.adapter.log.error(`closeServer mqttServer.close() error: ${err}`);
            }
        }
        if (this.aedesBroker) {
            const broker = this.aedesBroker;
            this.aedesBroker = null;
            try {
                broker.close((err) => {
                    if (err) {
                        this.adapter.log.debug(`Aedes broker close callback error: ${err}`);
                    } else {
                        this.adapter.log.debug('Aedes broker closed.');
                    }
                });
            } catch (err) {
                this.adapter.log.error(`closeServer aedesBroker.close() error: ${err}`);
            }
        }
    }
}

module.exports = {
    MqttServerController,
};
