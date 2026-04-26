'use strict';

const utils = require('./utils');

/**
 * Verwaltet das Schreiben von Zigbee2MQTT-Gerätedaten in ioBroker-States.
 * Puffert eingehende Nachrichten für noch nicht erstellte Geräte in einer Queue.
 */
class StatesController {
    /**
     * Erstellt eine neue StatesController-Instanz.
     *
     * @param {object}  adapter            Die ioBroker-Adapter-Instanz
     * @param {Array}   deviceCache        Gemeinsamer Cache aller bekannten Geräte
     * @param {Array}   groupCache         Gemeinsamer Cache aller bekannten Gruppen
     * @param {object}  logCustomizations  Debug/Filter-Einstellungen (debugDevices, logfilter)
     * @param {object}  createCache        Cache bereits erstellter ioBroker-Objekte
     */
    constructor(adapter, deviceCache, groupCache, logCustomizations, createCache) {
        this.adapter = adapter;
        this.groupCache = groupCache;
        this.deviceCache = deviceCache;
        this.logCustomizations = logCustomizations;
        this.createCache = createCache;
        this.incStatsQueue = [];
        this.timeOutCache = {};
        // Einmalig berechnen – wird nur bei Konfigurationsänderung ungültig
        this._debugDeviceList = logCustomizations.debugDevices
            ? String(logCustomizations.debugDevices).split(',').map((s) => s.trim()).filter(Boolean)
            : [];
    }

    /**
     * Verarbeitet eine eingehende Gerätenachricht von Zigbee2MQTT.
     * Ist das Gerät noch nicht im Cache bekannt, wird die Nachricht in der incStatsQueue
     * gepuffert und später über processQueue() erneut versucht.
     *
     * @param {{ topic: string, payload: any }} messageObj Die zu verarbeitende Nachricht
     */
    async processDeviceMessage(messageObj) {
        if (!messageObj || typeof messageObj !== 'object') {
            return;
        }
        if (messageObj.payload === '' || messageObj.payload === undefined || messageObj.payload === null) {
            return;
        }

        const device = this.groupCache.concat(this.deviceCache).find((x) => x.id === messageObj.topic);
        if (device) {
            try {
                await this.setDeviceStateSafely(messageObj, device);
            } catch (error) {
                this.adapter.log.error(`setDeviceStateSafely error for ${messageObj.topic}: ${error}`);
            }
        } else {
            // Wenn das Gerät (noch) nicht bekannt ist: Message in Queue stellen.
            // Existiert für dieses Topic bereits ein Eintrag, wird er mit den aktuellen
            // Payload-Daten überschrieben, damit wir stets den neuesten Stand verarbeiten.
            const existingIdx = this.incStatsQueue.findIndex((x) => x && x.topic === messageObj.topic);
            if (existingIdx !== -1) {
                const ttl = (this.incStatsQueue[existingIdx]._ttl || 0) + 1;
                if (ttl > 10) {
                    this.adapter.log.warn(`incStatsQueue: dropping message for unknown device ${messageObj.topic} after ${ttl} retries`);
                    this.incStatsQueue.splice(existingIdx, 1);
                    return;
                }
                this.incStatsQueue[existingIdx] = { ...messageObj, _ttl: ttl };
            } else {
                if (this.incStatsQueue.length < 500) {
                    this.incStatsQueue.push({ ...messageObj, _ttl: 1 });
                } else {
                    this.adapter.log.warn(`incStatsQueue is full (500), dropping message for ${messageObj.topic}`);
                }
            }
            this.adapter.log.debug(`Device: ${messageObj.topic} not found, queue state in incStatsQueue!`);
        }
    }

    /**
     * Schreibt alle State-Werte einer Nachricht in die zugehörigen ioBroker-States.
     * Action-States werden gesammelt und am Ende gesondert behandelt.
     *
     * @param {{ topic: string, payload: object }} messageObj Die zu verarbeitende Nachricht
     * @param {object} device                                 Das zugehörige Geräteobjekt aus dem Cache
     */
    async setDeviceStateSafely(messageObj, device) {
        if (this._debugDeviceList.includes(device.ieee_address)) {
            this.adapter.log.warn(`--->>> fromZ2M -> ${device.ieee_address} states: ${JSON.stringify(messageObj)}`);
        }

        const actionStates = [];
        // Fix 1: Flag damit messageObj nur EINMAL in die Queue kommt, egal wie viele
        //         States noch nicht im createCache sind (verhindert N-faches Requeue)
        let queuedThisRound = false;

        const pushToQueue = (msg) => {
            if (queuedThisRound) {return;}
            const existingIdx = this.incStatsQueue.findIndex((x) => x && x.topic === msg.topic);
            if (existingIdx !== -1) {
                const ttl = (this.incStatsQueue[existingIdx]._ttl || 0) + 1;
                if (ttl > 10) {
                    this.adapter.log.warn(`incStatsQueue: dropping message for ${msg.topic} after ${ttl} retries (state not yet created)`);
                    this.incStatsQueue.splice(existingIdx, 1);
                    return;
                }
                this.incStatsQueue[existingIdx] = { ...msg, _ttl: ttl };
            } else if (this.incStatsQueue.length < 500) {
                this.incStatsQueue.push({ ...msg, _ttl: 1 });
            } else {
                this.adapter.log.warn(`incStatsQueue is full, dropping message for ${msg.topic}`);
            }
            queuedThisRound = true;
        };

        if (!messageObj.payload || typeof messageObj.payload !== 'object' || Array.isArray(messageObj.payload)) {
            return;
        }

        for (let [key, value] of Object.entries(messageObj.payload)) {
            if (value === undefined || value === null) {
                continue;
            }

            let states = device.states.filter(state => {
                return state.prop && state.prop === key;
            });

            if (states.length === 0) {
                states = device.states.filter((x) => x.id === key);
            }

            if (states.length === 0) {
                if (key === 'device' || device.ieee_address.includes('group')) {
                    // do nothing
                } else {
                    // some devices has addition information in payload
                    const fullPath = `${device.ieee_address}.additional`;

                    await this.adapter.setObjectNotExistsAsync(fullPath, {
                        type: 'channel',
                        common: {
                            name: 'hidden channelstate',
                        },
                        native: {},
                    });
                    await this.adapter.setObjectNotExistsAsync(`${fullPath}.${key}`, {
                        type: 'state',
                        common: {
                            name: key,
                            role: 'state',
                            type: typeof value,
                            write: false,
                            read: true,
                        },
                        native: {},
                    });
                    if (typeof value === 'object') {
                        value = JSON.stringify(value);
                    }
                    this.adapter.setState(`${fullPath}.${key}`, value, true);
                }
                continue;
            }

            for (const state of states) {
                const stateName = `${device.ieee_address}.${state.id}`;

                // set available status if last_seen is set
                if (state.id === 'last_seen' && this.adapter.config.allwaysUpdateAvailableState === true) {
                    await this.setStateSafelyAsync(`${device.ieee_address}.available`, true);
                }

                // State noch nicht erstellt? → einmal in Queue legen und weiter
                if (!this.createCache[device.ieee_address]
                ||  !this.createCache[device.ieee_address][state.id]
                ||  this.createCache[device.ieee_address][state.id].created !== true) {
                    pushToQueue(messageObj);
                    continue;
                }

                try {
                    //  Is an action
                    if (state.prop && state.prop === 'action') {
                        actionStates.push(state);
                    }
                    else if (this.adapter.config.allwaysUpdateOccupancyState === true && state.id === 'occupancy' && value === true) {
                        await this.setStateSafelyAsync(stateName, value);
                    }
                    else {
                        if (state.getter) {
                            await this.setStateChangedSafelyAsync(stateName, state.getter(messageObj.payload));
                        } else {
                            await this.setStateChangedSafelyAsync(stateName, value);
                        }
                    }
                } catch (err) {
                    this.adapter.log.warn(`Cannot set state ${stateName}: ${err}`);
                }
            }
        }


        for (const state of actionStates) {
            const stateName = `${device.ieee_address}.${state.id}`;

            try {
                const getterPayload = state.getter(messageObj.payload);
                if (getterPayload !== undefined) {
                    if (state.isEvent && state.isEvent === true) {
                        if (state.type === 'boolean') {
                            await this.setStateWithTimeoutAsync(stateName, getterPayload, 250);
                        } else {
                            await this.setStateSafelyAsync(stateName, getterPayload);
                        }
                    } else {
                        await this.setStateChangedSafelyAsync(stateName, getterPayload);
                    }
                }
            } catch (err) {
                this.adapter.log.warn(`Cannot set action state ${stateName}: ${err}`);
            }
        }
    }

    /**
     * Setzt einen ioBroker-State (immer, ohne Changed-Prüfung).
     * Ignoriert null/undefined-Werte sicher.
     *
     * @param {string} stateName Vollständiger State-Pfad (z.B. "0xAABB.state")
     * @param {*}      value     Der zu setzende Wert
     */
    async setStateSafelyAsync(stateName, value) {
        if (value === undefined || value === null) {
            return;
        }
        this.adapter.setState(stateName, value, true);
    }

    /**
     * Setzt einen ioBroker-State nur wenn sich der Wert geändert hat.
     * Ignoriert null/undefined-Werte sicher.
     *
     * @param {string} stateName Vollständiger State-Pfad (z.B. "0xAABB.brightness")
     * @param {*}      value     Der zu setzende Wert
     */
    async setStateChangedSafelyAsync(stateName, value) {
        if (value === undefined || value === null) {
            return;
        }
        await this.adapter.setStateChangedAsync(stateName, value, true);
    }

    /**
     * Setzt einen State sofort auf den angegebenen Wert und – nur bei value=true –
     * nach Ablauf des Timeouts automatisch zurück auf false (Button/Event-Reset).
     * Bei value=false wird kein Auto-Reset ausgelöst (z.B. brightness_stop-Signal).
     *
     * @param {string}  stateName Vollständiger State-Pfad
     * @param {boolean} value     Der sofort zu setzende Wert
     * @param {number}  timeout   Millisekunden bis zum Auto-Reset (nur bei value=true)
     */
    async setStateWithTimeoutAsync(stateName, value, timeout) {
        if (value === undefined || value === null) {
            return;
        }

        this.adapter.setState(stateName, value, true);

        // Auto-Reset (false → nichts tun, true → nach timeout zurücksetzen)
        // Wenn value=false (z.B. Stop-Aktion im simpleMoveStopState-Modus),
        // soll der State dauerhaft false bleiben und NICHT nach timeout auf true springen.
        if (this.timeOutCache[stateName]) {
            this.adapter.clearTimeout(this.timeOutCache[stateName]);
            delete this.timeOutCache[stateName];
        }
        if (value === true) {
            this.timeOutCache[stateName] = this.adapter.setTimeout(() => {
                delete this.timeOutCache[stateName];
                this.adapter.setState(stateName, false, true).catch((err) => {
                    this.adapter.log.debug(`setStateWithTimeout reset error for ${stateName}: ${err}`);
                });
            }, timeout);
        }
    }

    /**
     * Verarbeitet alle in der incStatsQueue gepufferten Nachrichten erneut.
     * Wird nach dem Aufbau des Geräte-/Gruppen-Caches aufgerufen.
     */
    async processQueue() {
        const oldIncStatsQueue = [];
        utils.moveArray(this.incStatsQueue, oldIncStatsQueue);
        while (oldIncStatsQueue.length > 0) {
            // seriell abarbeiten – nicht parallel feuern
            await this.processDeviceMessage(oldIncStatsQueue.shift());
        }
    }

    /**
     * Meldet alle bisherigen State-Subscriptions ab und subscribt neu
     * nur auf beschreibbare States aller bekannten Geräte und Gruppen.
     */
    subscribeWritableStates() {
        // Alle bestehenden State-Subscriptions zuerst abmelden
        this.adapter.unsubscribeStates('*');
        for (const device of this.groupCache.concat(this.deviceCache)) {
            if (!device || !Array.isArray(device.states)) {
                continue;
            }
            for (const state of device.states) {
                if (state && state.write === true) {
                    this.adapter.subscribeStates(`${device.ieee_address}.${state.id}`);
                }
            }
        }
        this.adapter.subscribeStates('info.debugmessages');
        this.adapter.subscribeStates('info.logfilter');
        this.adapter.subscribeStates('info.coordinator_check');
    }

    /**
     * Setzt alle "*.available"-States im Adapter auf false.
     * Wird beim Verbindungsverlust zu Zigbee2MQTT aufgerufen.
     */
    async setAllAvailableToFalse() {
        const availableStates = await this.adapter.getStatesAsync('*.available');
        if (!availableStates) {
            return;
        }
        for (const availableState of Object.keys(availableStates)) {
            await this.adapter.setStateChangedAsync(availableState, false, true);
        }
    }

    /**
     * Bricht alle laufenden Auto-Reset-Timer ab und leert den Timer-Cache.
     * Wird beim Adapter-Stop aufgerufen.
     */
    allTimerClear() {
        for (const timer of Object.keys(this.timeOutCache)) {
            this.adapter.clearTimeout(this.timeOutCache[timer]);
        }
        this.timeOutCache = {};
    }
}

module.exports = {
    StatesController,
};
