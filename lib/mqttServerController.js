'use strict';

const Aedes = require('aedes');
const net = require('node:net');

/**
 * Verwaltet den internen oder Dummy-MQTT-Server (Aedes) für den Zigbee2MQTT-Adapter.
 * Wird im intmqtt- und ws-Modus (dummyMqtt) verwendet.
 */
class MqttServerController {
    /**
     * Erstellt eine neue MqttServerController-Instanz.
     *
     * @param {object} adapter Die ioBroker-Adapter-Instanz
     */
    constructor(adapter) {
        this.adapter     = adapter;
        this.mqttServer  = null;
        this.aedesBroker = null;
    }

    /**
     * Prüft ob Port und Bind-Adresse konfiguriert sind.
     *
     * @returns {boolean} true wenn die Konfiguration vollständig ist, sonst false
     */
    _checkConfig() {
        if (!this.adapter.config.mqttServerPort || !this.adapter.config.mqttServerIPBind) {
            this.adapter.log.error('MQTT server config incomplete (mqttServerPort / mqttServerIPBind missing).');
            return false;
        }
        return true;
    }

    /**
     * Hängt error- und close-Event-Handler an den internen net.Server.
     *
     * @param {string} label Bezeichnung des Servers für Log-Ausgaben (z.B. "MQTT-Server")
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
     * Startet den internen MQTT-Server mit In-Memory-Persistenz (aedes + aedes-persistence-memory).
     * Wartet auf den erfolgreichen listen()-Aufruf bevor die Methode zurückkehrt.
     * Hinweis: aedes-persistence-nedb wurde entfernt, da es das veraltete nedb-Paket
     * mit util.isDate verwendet (entfernt in Node.js v12+). In-Memory ist für einen
     * internen Broker ausreichend – Clients subscriben sich bei Reconnect automatisch neu.
     */
    async createMQTTServer() {
        if (!this._checkConfig()) {
            return;
        }
        try {
            const MemoryPersistence = require('aedes-persistence');
            const db = MemoryPersistence();
            const aedes = Aedes({ persistence: db });
            this.aedesBroker = aedes;
            this.mqttServer  = net.createServer(aedes.handle);
            this._attachServerEvents('MQTT-Server');

            await new Promise((resolve, reject) => {
                this.mqttServer.once('error', reject);
                this.mqttServer.listen(
                    this.adapter.config.mqttServerPort,
                    this.adapter.config.mqttServerIPBind,
                    () => {
                        this.mqttServer.removeListener('error', reject);
                        this.adapter.log.info(
                            `Starting MQTT-Server on IP ${this.adapter.config.mqttServerIPBind} and Port ${this.adapter.config.mqttServerPort}`
                        );
                        resolve();
                    }
                );
            });
        } catch (err) {
            this.adapter.log.error(`createMQTTServer error: ${err && err.message ? err.message : String(err)}`);
            // Sicherstellen dass kein halboffener Server übrig bleibt
            this.closeServer();
        }
    }

    /**
     * Startet einen Dummy-MQTT-Server ohne Persistenz.
     * Wird im WebSocket-Modus (dummyMqtt=true) benötigt damit Z2M einen MQTT-Broker findet.
     */
    async createDummyMQTTServer() {
        if (!this._checkConfig()) {
            return;
        }
        try {
             const aedes = Aedes();
            this.aedesBroker = aedes;
            this.mqttServer  = net.createServer(aedes.handle);
            this._attachServerEvents('DummyMQTT-Server');

            await new Promise((resolve, reject) => {
                this.mqttServer.once('error', reject);
                this.mqttServer.listen(
                    this.adapter.config.mqttServerPort,
                    this.adapter.config.mqttServerIPBind,
                    () => {
                        this.mqttServer.removeListener('error', reject);
                        this.adapter.log.info(
                            `Starting DummyMQTT-Server on IP ${this.adapter.config.mqttServerIPBind} and Port ${this.adapter.config.mqttServerPort}`
                        );
                        resolve();
                    }
                );
            });
        } catch (err) {
            this.adapter.log.error(`createDummyMQTTServer error: ${err && err.message ? err.message : String(err)}`);
            this.closeServer();
        }
    }

    /**
     * Schließt den MQTT-Server und den Aedes-Broker sicher.
     * Wird beim Adapter-Stop oder nach einem Fehler beim Start aufgerufen.
     */
    closeServer() {
        if (this.aedesBroker) {
            const broker = this.aedesBroker;
            this.aedesBroker = null;
            try {
                broker.close(() => {
                    this.adapter.log.debug('Aedes broker closed.');
                });
            } catch (err) {
                this.adapter.log.error(`closeServer aedesBroker.close() error: ${err}`);
            }
        }
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
    }
}

module.exports = {
    MqttServerController,
};
