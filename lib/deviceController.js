const statesDefs = require('./states').states;
const createDeviceFromExposes = require('./exposes').createDeviceFromExposes;
const utils = require('./utils');
const colors = require('./colors.js');
const rgb = require('./rgb.js');
const ImageController = require('./imageController').ImageController;

/**
 * Prüft ob eine ieee_address in der kommaseparierten debugDevices-Liste enthalten ist.
 * String.includes() würde Substring-Matches liefern (z.B. "0x12" trifft "0x1234").
 *
 * @param {string} debugDevices
 * @param {string} address
 * @returns {boolean}
 */
function isDebugDevice(debugDevices, address) {
    if (!debugDevices || !address) { return false; }
    return String(debugDevices).split(',').map((s) => s.trim()).includes(address);
}

/**
 * Verwaltet das Erstellen und Aktualisieren von Geräte- und Gruppenobjekten in ioBroker
 * basierend auf den Zigbee2MQTT-Exposes.
 */
class DeviceController {
    /**
     * Erstellt eine neue DeviceController-Instanz.
     *
     * @param {object} adapter           Die ioBroker-Adapter-Instanz
     * @param {Array}  deviceCache       Gemeinsamer Cache aller bekannten Geräte
     * @param {Array}  groupCache        Gemeinsamer Cache aller bekannten Gruppen
     * @param {object} config            Adapter-Konfiguration
     * @param {object} logCustomizations Debug/Filter-Einstellungen (debugDevices, logfilter)
     * @param {object} createCache       Cache bereits erstellter ioBroker-Objekte
     */
    constructor(adapter, deviceCache, groupCache, config, logCustomizations, createCache) {
        this.adapter = adapter;
        this.groupCache = groupCache;
        this.deviceCache = deviceCache;
        this.config = config;
        this.logCustomizations = logCustomizations;
        this.createCache = createCache;
        this.imageController = new ImageController(adapter);
    }

    /**
     * Erstellt Geräte-Definitionen aus dem bridge/devices-Payload von Zigbee2MQTT
     * und befüllt den deviceCache neu.
     *
     * @param {Array} devicesMessage Array mit Gerätedaten aus dem bridge/devices-Topic
     */
    async createDeviceDefinitions(devicesMessage) {
        // Fix 1: devicesMessage kann null/kein Array sein (z.B. leerer bridge/devices payload)
        if (!Array.isArray(devicesMessage)) {
            this.adapter.log.warn('createDeviceDefinitions: payload ist kein Array');
            return;
        }
        utils.clearArray(this.deviceCache);
        for (const devicesMessag of devicesMessage) {
            if (!devicesMessag || !devicesMessag.ieee_address) {
                continue;
            }

            if (isDebugDevice(this.logCustomizations.debugDevices, devicesMessag.ieee_address)) {
                this.adapter.log.warn(
                    `--->>> fromZ2M -> ${devicesMessag.ieee_address} exposes: ${JSON.stringify(devicesMessag)}`
                );
            }

            if (devicesMessag.definition != null) {
                this.removeDeviceByIeee(this.deviceCache, devicesMessag.ieee_address);

                // Fix 3: exposes muss auch ein Array sein
                if (Array.isArray(devicesMessag.definition.exposes)) {
                    try {
                        const newDevice = await createDeviceFromExposes(devicesMessag, this.adapter);
                        newDevice.icon = await this.imageController.getDeviceIcon(devicesMessag);
                        this.deviceCache.push(newDevice);
                    } catch (err) {
                        // Fix 2: friendly_name im Fehlerlog verwenden
                        this.adapter.log.warn(`Cannot create Device from Exposes for ${devicesMessag.friendly_name || devicesMessag.ieee_address}!`);
                        this.adapter.log.debug(JSON.stringify(devicesMessag));
                        this.adapter.log.debug(err);
                    }
                }
            }
        }
    }

    /**
     * Erstellt die State-Definition für eine Zigbee2MQTT-Gruppe und legt sie im groupCache ab.
     *
     * @param {string} groupID      Friendly-Name der Gruppe (wird als ioBroker-ID verwendet)
     * @param {string} ieee_address Interne Gruppen-ID (z.B. "group_1")
     * @param {Array}  scenes       Liste der Szenen-Objekte ({id, name}) der Gruppe
     */
    defineGroupDevice(groupID, ieee_address, scenes) {
        const brmPropName = this.adapter.config.brightnessMoveOnOff === true ? 'brightness_move_onoff' : 'brightness_move';
        const brsPropName = this.adapter.config.brightnessStepOnOff === true ? 'brightness_step_onoff' : 'brightness_step';
        const newDevice = {
            id: groupID,
            ieee_address: ieee_address,
            icon: undefined, //  await imageController.getDeviceIcon(devicesMessag), device.definition.model
            optionsValues: {},
            states: [
                // Fix 1: Klone aller statesDefs-Objekte – sonst werden geteilte Referenzen mutiert
                Object.assign({}, statesDefs.available),
                Object.assign({}, statesDefs.brightness),
                Object.assign({}, statesDefs.colortemp_move),
                Object.assign({}, statesDefs.transition),
                {
                    id: 'state',
                    prop: 'state',
                    name: 'Switch state',
                    options: ['transition'],
                    icon: undefined,
                    role: 'switch',
                    write: true,
                    read: true,
                    type: 'boolean',
                    def: false,
                    getter: (payload) => payload.state === 'ON',
                    setter: (value) => (value ? 'ON' : 'OFF'),
                },
                {
                    id: 'brightness_move',
                    prop: brmPropName,
                    name: 'Increases or decreases the brightness by X units per second',
                    icon: undefined,
                    role: 'state',
                    write: true,
                    read: false,
                    type: 'number',
                    min: -50,
                    max: 50,
                    def: 0,
                },
                {
                    id: 'brightness_step',
                    prop: brsPropName,
                    name: 'Increases or decreases brightness by X steps',
                    icon: undefined,
                    role: 'state',
                    write: true,
                    read: false,
                    type: 'number',
                    min: -255,
                    max: 255,
                    def: 0,
                },
                {
                    id: 'color',
                    prop: 'color',
                    name: 'Color',
                    options: ['transition'],
                    icon: undefined,
                    role: 'level.color.rgb',
                    write: true,
                    read: true,
                    type: 'string',
                    def: '#ff00ff',
                    setter: (value) => {
                        // Fix 6: redundante [0,0]-Initialisierung entfernt
                        const rgbcolor = colors.ParseColor(value);
                        const xy = rgb.rgb_to_cie(rgbcolor.r, rgbcolor.g, rgbcolor.b);
                        return {
                            x: xy[0],
                            y: xy[1],
                        };
                    },
                    getter: (payload) => {
                        if (payload.color_mode !== 'xy' && !this.config.colorTempSyncColor) {
                            return undefined;
                        }
                        // Fix 2: x=0 / y=0 sind gültige CIE-Koordinaten → != null statt truthy
                        if (payload.color && payload.color.x != null && payload.color.y != null) {
                            const colorval = rgb.cie_to_rgb(payload.color.x, payload.color.y);
                            return (
                                `#${utils.decimalToHex(colorval[0])
                                }${utils.decimalToHex(colorval[1])
                                }${utils.decimalToHex(colorval[2])}`
                            );
                        }
                        return undefined;
                    },
                },
                {
                    id: 'colortemp',
                    prop: 'color_temp',
                    name: 'Color temperature',
                    options: ['transition'],
                    icon: undefined,
                    role: 'level.color.temperature',
                    write: true,
                    read: true,
                    type: 'number',
                    min: this.config.useKelvin === true ? utils.miredKelvinConversion(550) : 150,
                    max: this.config.useKelvin === true ? utils.miredKelvinConversion(153) : 500,
                    def: this.config.useKelvin === true ? utils.miredKelvinConversion(153) : 500,
                    unit: this.config.useKelvin === true ? 'K' : 'mired',
                    setter: (value) => {
                        return utils.toMired(value);
                    },
                    getter: (payload) => {
                        if (payload.color_mode !== 'color_temp') {
                            return undefined;
                        }
                        if (payload.color_temp == null) {
                            return undefined;
                        }
                        if (this.config.useKelvin === true) {
                            return utils.miredKelvinConversion(payload.color_temp);
                        }
                        return payload.color_temp;
                    },
                },
                {
                    id: 'state_toggle',
                    name: 'Toggle the state',
                    options: ['transition'],
                    icon: undefined,
                    role: 'button',
                    write: true,
                    read: true,
                    type: 'boolean',
                    setattr: 'state',
                    def: true,
                    setter: (value) => (value ? 'TOGGLE' : undefined),
                },
                {
                    id: 'effect',
                    name: 'Triggers an effect on the light (e.g. make light blink for a few seconds)',
                    prop: 'effect',
                    icon: undefined,
                    role: 'state',
                    write: true,
                    read: true,
                    type: 'string',
                    def: '',
                    states: {
                        blink: 'blink',
                        breathe: 'breathe',
                        okay: 'okay',
                        channel_change: 'channel_change',
                        finish_effect: 'finish_effect',
                        stop_effect: 'stop_effect',
                    },
                },
            ],
        };

        // Create buttons for scenes
        for (const scene of scenes) {
            const sceneSate = {
                id: `scene_${scene.id}`,
                prop: `scene_recall`,
                name: scene.name || `Scene ${scene.id}`,
                icon: undefined,
                role: 'button',
                write: true,
                read: true,
                def: true,
                type: 'boolean',
                setter: (value) => (value ? scene.id : undefined),
            };
            newDevice.states.push(sceneSate);
        }

        // if the device is already present in the cache, remove it
        this.removeDeviceByIeee(this.groupCache, ieee_address);
        this.groupCache.push(newDevice);
    }

    /**
     * Erstellt Gruppen-Definitionen aus dem bridge/groups-Payload von Zigbee2MQTT
     * und befüllt den groupCache neu.
     *
     * @param {Array} groupsMessage Array mit Gruppendaten aus dem bridge/groups-Topic
     */
    async createGroupDefinitions(groupsMessage) {
        // Fix 4: groupsMessage kann null/kein Array sein
        if (!Array.isArray(groupsMessage)) {
            this.adapter.log.warn('createGroupDefinitions: payload ist kein Array');
            return;
        }
        utils.clearArray(this.groupCache);
        for (const groupMessage of groupsMessage) {
            // Fix 5: fehlende Pflichtfelder abfangen
            if (!groupMessage || groupMessage.id == null || !groupMessage.friendly_name) {
                continue;
            }
            if (isDebugDevice(this.logCustomizations.debugDevices, String(groupMessage.id))) {
                this.adapter.log.warn(`--->>> fromZ2M -> ${groupMessage.id} exposes: ${JSON.stringify(groupMessage)}`);
            }
            this.defineGroupDevice(groupMessage.friendly_name, `group_${groupMessage.id}`, groupMessage.scenes || []);
        }
    }

    /**
     * Legt alle Geräte und Gruppen aus den Caches als ioBroker-Objekte an
     * bzw. aktualisiert sie falls sich Name oder Beschreibung geändert haben.
     */
    async createOrUpdateDevices() {
        // Gruppen und Geräte getrennt verarbeiten
        for (const device of this.groupCache) {
            await this._createOrUpdateSingleDevice(device, true);
        }
        for (const device of this.deviceCache) {
            await this._createOrUpdateSingleDevice(device, false);
        }
    }

    /**
     * Legt ein einzelnes Gerät oder eine Gruppe als ioBroker-Objekt an oder aktualisiert es.
     *
     * @param {object}  device   Das Gerät/Gruppen-Objekt aus dem Cache
     * @param {boolean} isGroup  true = Gruppe, false = echtes Gerät
     */
    async _createOrUpdateSingleDevice(device, isGroup) {
        let deviceName = this.getDeviceName(device);
        let description = this.getDeviceDescription(device);

        if (deviceName === '' && device.description) {
            deviceName = device.description;
            description = '';
        }

        // Disabled-Flag nur bei echten Geräten – Gruppen können nicht disabled sein
        if (!isGroup && device.disabled === true) {
            if (this.config.useEventInDesc === true) {
                description = 'Device is disabled!';
            } else {
                // Fallback auf ieee_address wenn kein friendly_name vorhanden
                const label = deviceName || device.ieee_address;
                deviceName = `[Disabled] ${label}`;
            }
        }

        if (!this.createCache[device.ieee_address] ||
            this.createCache[device.ieee_address].name !== deviceName ||
            this.createCache[device.ieee_address].description !== description) {

            const deviceObj = {
                type: 'device',
                common: {
                    icon: device.icon,
                    name: deviceName,
                    desc: description,
                    statusStates: { onlineId: '' },
                },
                native: {
                    deviceRemoved: false,
                    groupDevice: isGroup,
                },
            };

            if (isGroup || device.disabled !== true) {
                deviceObj.common.statusStates.onlineId = `${this.adapter.name}.${this.adapter.instance}.${device.ieee_address}.available`;
            }

            await this.adapter.extendObjectAsync(device.ieee_address, deviceObj);
            // Bestehende State-Einträge im Cache bewahren – nur name/description aktualisieren
            if (!this.createCache[device.ieee_address]) {
                this.createCache[device.ieee_address] = {};
            }
            this.createCache[device.ieee_address].name        = deviceName;
            this.createCache[device.ieee_address].description = description;
        }

        if (!Array.isArray(device.states)) {
            return;
        }

        // Veraltete scene_*-States bereinigen – getForeignObjectsAsync mit vollem Namespace-Pfad
        const sceneObjects = await this.adapter.getForeignObjectsAsync(
            `${this.adapter.namespace}.${device.ieee_address}.scene_*`
        );
        if (sceneObjects) {
            for (const sceneObjId of Object.keys(sceneObjects)) {
                const parts = sceneObjId.split('.');
                const stateID = parts[parts.length - 1];
                if (!device.states.find((x) => x.id === stateID)) {
                    await this.adapter.delForeignObjectAsync(sceneObjId);
                }
            }
        }

        for (const state of device.states) {
            if (state && (!this.createCache[device.ieee_address][state.id] ||
                this.createCache[device.ieee_address][state.id].name !== state.name)) {

                const iobState = {
                    type: 'state',
                    common: this.copyAndCleanStateObj(state),
                    native: {},
                };

                await this.adapter.extendObjectAsync(`${device.ieee_address}.${state.id}`, iobState);
                this.createCache[device.ieee_address][state.id] = { name: state.name, created: true };
            }
        }
    }

    /**
     * Prüft alle in ioBroker vorhandenen Geräte-Objekte gegen den deviceCache und markiert
     * nicht mehr vorhandene Geräte als "[Removed]" bzw. setzt available auf false.
     */
    async checkAndProgressDeviceRemove() {
        let iobDevices = await this.adapter.getDevicesAsync();
        if (!iobDevices) {
            return;
        }
        // Nur nicht-entfernte, echte Geräte (keine Gruppen) in einem Schritt filtern
        iobDevices = iobDevices.filter((x) =>
            x.native && x.native.deviceRemoved === false && x.native.groupDevice === false
        );

        for (const iobDevice of iobDevices) {
            const idParts = iobDevice._id.split('.');
            if (idParts.length < 3) {continue;}
            const ieee_address = idParts[2];

            // Gruppen-Einträge im ioBroker-Baum explizit überspringen
            if (ieee_address.startsWith('group_')) {continue;}

            if (!this.deviceCache.find((x) => x.ieee_address === ieee_address)) {
                let deviceName = iobDevice.common && iobDevice.common.name ? iobDevice.common.name : ieee_address;
                let description = '';

                if (this.config.useEventInDesc === true) {
                    description = 'Device was removed!';
                } else {
                    deviceName = `[Removed] ${deviceName}`;
                }

                await this.adapter.extendObjectAsync(ieee_address, {
                    common: { name: deviceName, desc: description },
                    native: { deviceRemoved: true },
                });
                await this.adapter.setStateChangedAsync(`${ieee_address}.available`, false, true);

                delete this.createCache[ieee_address];
            }
        }
    }

    /**
     * Aktualisiert die Geräte-ID im Cache wenn ein Gerät in Zigbee2MQTT umbenannt wurde.
     *
     * @param {{ payload: { data: { from: string, to: string } } }} messageObj Die Rename-Nachricht
     */
    async renameDeviceInCache(messageObj) {
        if (!messageObj.payload || !messageObj.payload.data) {
            return;
        }
        if (!messageObj.payload.data.from || !messageObj.payload.data.to) {
            return;
        }
        const renamedDevice = this.groupCache
            .concat(this.deviceCache)
            .find((x) => x.id === messageObj.payload.data.from);
        if (renamedDevice) {
            renamedDevice.id = messageObj.payload.data.to;
        }
    }

    /**
     * Entfernt ein Gerät anhand seiner IEEE-Adresse aus dem angegebenen Cache-Array.
     *
     * @param {Array}  devices      Das Cache-Array (deviceCache oder groupCache)
     * @param {string} ieee_address Die IEEE-Adresse des zu entfernenden Geräts
     */
    removeDeviceByIeee(devices, ieee_address) {
        const idx = devices.findIndex((x) => x.ieee_address === ieee_address);
        if (idx > -1) {
            devices.splice(idx, 1);
        }
    }

    /**
     * Erstellt eine bereinigte Kopie eines State-Objekts ohne interne Laufzeit-Felder
     * (getter, setter, prop, etc.) für die ioBroker-Objektdefinition.
     *
     * @param {object} state Das vollständige State-Objekt mit Laufzeit-Feldern
     * @returns {object}     Das bereinigte State-Objekt für extendObjectAsync
     */
    copyAndCleanStateObj(state) {
        const iobState = { ...state };
        const blacklistedKeys = [
            'prop',
            'setter',
            'setterOpt',
            'getter',
            'setattr',
            'readable',
            'writable',
            'isOption',
            'inOptions',
            'isEvent',
            'options',
        ];
        for (const blacklistedKey of blacklistedKeys) {
            delete iobState[blacklistedKey];
        }
        return iobState;
    }

    /**
     * Gibt den Anzeigenamen eines Geräts zurück.
     * Ist friendly_name gleich der IEEE-Adresse, wird ein leerer String zurückgegeben.
     *
     * @param {object} device Das Geräteobjekt aus dem Cache
     * @returns {string}      Der Anzeigename oder ""
     */
    getDeviceName(device) {
        return device.id === device.ieee_address ? '' : device.id;
    }

    /**
     * Gibt die Beschreibung eines Geräts zurück (oder "" wenn keine vorhanden).
     *
     * @param {object} device Das Geräteobjekt aus dem Cache
     * @returns {string}      Die Beschreibung oder ""
     */
    getDeviceDescription(device) {
        return device.description ? device.description : '';
    }

    /**
     * Verarbeitet die Antwort eines Coordinator-Check-Requests von Zigbee2MQTT
     * und schreibt fehlende Router in die info-States.
     *
     * @param {{ data: { missing_routers: Array } }} payload Der Antwort-Payload
     */
    async processCoordinatorCheck(payload) {
        if (payload && payload.data && payload.data.missing_routers) {
            const missingRoutersCount = payload.data.missing_routers.length;
            this.adapter.setState('info.missing_routers', JSON.stringify(payload.data.missing_routers), true);
            this.adapter.setState('info.missing_routers_count', missingRoutersCount, true);

            if (missingRoutersCount > 0) {
                const logLvl = this.config.coordinatorCheckLogLvl;
                const logFn = (logLvl && typeof this.adapter.log[logLvl] === 'function')
                    ? this.adapter.log[logLvl].bind(this.adapter.log)
                    : this.adapter.log.warn.bind(this.adapter.log);
                logFn(
                    `Coordinator check: ${missingRoutersCount} missing routers were found, please check the data point 'zigbee2mqtt.x.info.missing_routers'!`
                );
            } else {
                this.adapter.log.info('Coordinator check: No missing router was found.');
            }
        }
    }
}

module.exports = {
    DeviceController,
};
