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

        // PERFORMANCE: Map-Cache für Topic->Device Lookup (vermeidet concat().find() pro Nachricht)
        this.deviceMap = new Map();

        // PERFORMANCE: Session-Cache für bereits per setObjectNotExistsAsync erstellte IDs
        // Vermeidet wiederholte js-controller-Roundtrips
        this.ensuredObjects = new Set();
    }

    /**
     * Invalidiert den Topic->Device Map-Cache sowie den Session-Cache der
     * bereits sichergestellten Objekte. Muss aufgerufen werden, wenn
     * deviceCache/groupCache zur Laufzeit neu aufgebaut werden.
     */
    clearDeviceMap() {
        this.deviceMap.clear();
        this.ensuredObjects.clear();
    }

    /**
     * Findet ein Gerät oder eine Gruppe anhand des Topics.
     * Nutzt einen Map-Cache und füllt diesen bei Bedarf über eine einmalige lineare Suche.
     *
     * @param {string} topic Das Topic (entspricht device.id)
     * @returns {object|null} Das gefundene Geräte-/Gruppenobjekt oder null
     */
    findDeviceByTopic(topic) {        if (!topic) {
            return null;
        }
        const t = String(topic);
        if (this.deviceMap.has(t)) {
            return this.deviceMap.get(t);
        }

        // Fallback: lineare Suche (einmalig) und Cache-Eintrag
        for (const grp of this.groupCache || []) {
            if (grp && grp.id === t) {
                this.deviceMap.set(t, grp);
                return grp;
            }
        }
        for (const dev of this.deviceCache || []) {
            if (dev && dev.id === t) {
                this.deviceMap.set(t, dev);
                return dev;
            }
        }
        return null;
    }

    /**
     * Legt ein ioBroker-Objekt nur einmal pro Session an (reduziert setObjectNotExistsAsync-Roundtrips).
     *
     * @param {string} id  Vollständige Objekt-ID
     * @param {object} obj Objekt-Definition für setObjectNotExistsAsync
     */
    async ensureObjectOnce(id, obj) {
        if (!id) {
            return;
        }
        if (this.ensuredObjects.has(id)) {
            return;
        }
        try {
            await this.adapter.setObjectNotExistsAsync(id, obj);
            this.ensuredObjects.add(id);
        } catch (e) {
            // Loggen, aber nicht wiederholend blockieren
            this.adapter.log.warn(`ensureObjectOnce: setObjectNotExistsAsync failed for ${id}: ${e}`);
        }
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

        // PERFORMANCE: Map-basiertes Lookup statt concat().find()
        const device = this.findDeviceByTopic(messageObj.topic);
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

        // Fix 3: Vorab prüfen, ob überhaupt ein State des Devices existiert.
        // Nur wenn KEIN EINZIGER State existiert → requeue.
        // Wenn mindestens einer existiert → verarbeite vorhandene, ignoriere fehlende.
        let hasAnyExistingState = false;
        for (const key of Object.keys(messageObj.payload)) {
            if (hasAnyExistingState) { break; }
            let states = device.states.filter(state => state.prop && state.prop === key);
            if (states.length === 0) { states = device.states.filter(x => x.id === key); }
            for (const state of states) {
                if (this.createCache[device.ieee_address]
                    && this.createCache[device.ieee_address][state.id]
                    && this.createCache[device.ieee_address][state.id].created === true) {
                    hasAnyExistingState = true;
                    break;
                }
            }
        }

        if (!hasAnyExistingState) {
            // Kein einziger State existiert → Nachricht in Queue stellen
            pushToQueue(messageObj);
            return;
        }

        // COLLECTION: Alle non-action state write-Promises sammeln und dann parallel ausführen
        const stateWrites = [];
        // Flag für available-Update (wenn last_seen vorhanden und config aktiv)
        let needSetAvailableTrue = false;

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

                    // PERFORMANCE: ensure object only once per session
                    await this.ensureObjectOnce(fullPath, {
                        type: 'channel',
                        common: {
                            name: 'hidden channelstate',
                        },
                        native: {},
                    });
                    await this.ensureObjectOnce(`${fullPath}.${key}`, {
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
                    // write additional state without awaiting
                    stateWrites.push((async () => {
                        try {
                            await this.adapter.setStateChangedAsync(`${fullPath}.${key}`, value, true);
                        } catch (e) {
                            this.adapter.log.warn(`Cannot set additional state ${fullPath}.${key}: ${e}`);
                        }
                    })());
                }
                continue;
            }

            for (const state of states) {
                const stateName = `${device.ieee_address}.${state.id}`;

                // set available status if last_seen is set
                if (state.id === 'last_seen' && this.adapter.config.alwaysUpdateAvailableState === true) {
                    // mark flag to set available before other writes
                    needSetAvailableTrue = true;
                }

                // State noch nicht erstellt? → überspringen (Requeue erfolgt nur,
                // wenn GAR KEIN State des Devices existiert – siehe Pre-Check oben)
                if (!this.createCache[device.ieee_address]
                ||  !this.createCache[device.ieee_address][state.id]
                ||  this.createCache[device.ieee_address][state.id].created !== true) {
                    // If none created we already pushed to queue earlier
                    continue;
                }

                try {
                    //  Is an action
                    if (state.prop && state.prop === 'action') {
                        actionStates.push(state);
                    }
                    else if (this.adapter.config.alwaysUpdateOccupancyState === true && state.id === 'occupancy' && value === true) {
                        // occupancy true: schedule write
                        stateWrites.push((async () => {
                            try {
                                await this.setStateSafelyAsync(stateName, value);
                            } catch (e) {
                                this.adapter.log.warn(`Cannot set occupancy ${stateName}: ${e}`);
                            }
                        })());
                    }
                    else {
                        if (state.getter) {
                            // schedule changed-safe write
                            stateWrites.push((async () => {
                                try {
                                    await this.setStateChangedSafelyAsync(stateName, state.getter(messageObj.payload));
                                } catch (e) {
                                    this.adapter.log.warn(`Cannot set state ${stateName}: ${e}`);
                                }
                            })());
                        } else {
                            stateWrites.push((async () => {
                                try {
                                    await this.setStateChangedSafelyAsync(stateName, value);
                                } catch (e) {
                                    this.adapter.log.warn(`Cannot set state ${stateName}: ${e}`);
                                }
                            })());
                        }
                    }
                } catch (err) {
                    this.adapter.log.warn(`Cannot set state ${stateName}: ${err}`);
                }
            }
        }

        // Wenn last_seen vorhanden: setze available zuerst (nicht parallelisiert)
        if (needSetAvailableTrue) {
            try {
                await this.setStateSafelyAsync(`${device.ieee_address}.available`, true);
            } catch (e) {
                this.adapter.log.warn(`Cannot set available for ${device.ieee_address}: ${e}`);
            }
        }

        // Parallel ausführen: non-action states
        try {
            await Promise.all(stateWrites);
        } catch (e) {
            this.adapter.log.warn(`processDeviceMessage: parallel writes encountered error: ${e}`);
        }

        // ACTION states: auch parallel ausführen, berücksichtige setStateWithTimeoutAsync
        const actionPromises = [];
        for (const state of actionStates) {
            const stateName = `${device.ieee_address}.${state.id}`;
            actionPromises.push((async () => {
                try {
                    const getterPayload = state.getter(messageObj.payload);
                    if (getterPayload !== undefined) {
                        if (state.isEvent && state.isEvent === true) {
                            if (state.type === 'boolean') {
                                // setStateWithTimeoutAsync kümmert sich intern um Timer/Optimierung
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
            })());
        }

        if (actionPromises.length > 0) {
            try {
                await Promise.all(actionPromises);
            } catch (e) {
                this.adapter.log.warn(`processDeviceMessage: action state parallel writes error: ${e}`);
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

        // Prüfen, ob bereits ein Timer läuft (State ist dann schon auf true)
        const wasAlreadyTrue = !!this.timeOutCache[stateName];

        // Timer immer clearen, wenn vorhanden
        if (this.timeOutCache[stateName]) {
            this.adapter.clearTimeout(this.timeOutCache[stateName]);
            delete this.timeOutCache[stateName];
        }

        if (value === true) {
            // Nur setState aufrufen, wenn der State NICHT bereits auf true war.
            // Bei Dauerfeuer (value=true→true schneller als timeout) spart das
            // den unnötigen setState-Call und verhindert, dass der Timer
            // nie ausgelöst wird (Timer-Leak).
            if (!wasAlreadyTrue) {
                await this.setStateSafelyAsync(stateName, true);
            }
            // Neuen Timer für Auto-Reset setzen
            this.timeOutCache[stateName] = this.adapter.setTimeout(() => {
                delete this.timeOutCache[stateName];
                this.adapter.setState(stateName, false, true).catch((err) => {
                    this.adapter.log.debug(`setStateWithTimeout reset error for ${stateName}: ${err}`);
                });
            }, timeout);
        } else {
            // value === false: State setzen, Timer bereits gelöscht
            await this.setStateSafelyAsync(stateName, false);
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
