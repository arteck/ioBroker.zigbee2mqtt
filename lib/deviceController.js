const statesDefs = require('./states').states;
const createDeviceFromExposes = require('./exposes').createDeviceFromExposes;
const utils = require('./utils');
const colors = require('./colors.js');
const rgb = require('./rgb.js');
const ImageController = require('./imageController').ImageController;
const dmUtils = require('@iobroker/dm-utils');

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
class DeviceController extends dmUtils.DeviceManagement {
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
        super(adapter);
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
                        newDevice.manufacturer = devicesMessag.definition.vendor || '';
                        newDevice.model = devicesMessag.definition.model || '';
                        newDevice.modelDescription = devicesMessag.definition.description || '';
                        newDevice.powerSource = devicesMessag.power_source || '';
                        newDevice.interviewCompleted = !!devicesMessag.interview_completed;
                        newDevice.supported = !!devicesMessag.supported;
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
     * Liefert den Anzeigenamen eines Geräts zurück.
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
     * Lädt alle Zigbee2MQTT-Geräte und Gruppen und meldet sie an den Device-Manager.
     * Wird vom dm-utils-Framework bei 'dm:loadDevices' aufgerufen.
     *
     * @param {object} context - Der DeviceLoadContext (addDevice / setTotalDevices / complete).
     */
    async loadDevices(context) {
        const allDevices = [...this.deviceCache];
        context.setTotalDevices(allDevices.length);

        const SKIP_STATES = new Set([
            'available', 'transition', 'brightness_move', 'brightness_step',
            'state_toggle', 'effect', 'color_temp_move',
        ]);

        const SKIP_READ_STATES = new Set([
            'link_quality', 'simulated_brightness', 'last_seen',
            'trigger_count', 'trigger_indicator',
        ]);

        const SKIP_NAME_PREFIXES = [
            'Indicates how many',
            'Indicates whether',
            'Triggered action',
        ];

        for (const device of allDevices) {
            const status = {};

            try {
                const availState = await this.adapter.getStateAsync(`${device.ieee_address}.available`);
                status.connection = availState && availState.val === true ? 'connected' : 'disconnected';
            } catch (_e) {
                status.connection = 'disconnected';
            }

            try {
                const battState = await this.adapter.getStateAsync(`${device.ieee_address}.battery`);
                if (battState && battState.val != null) {
                    status.battery = battState.val;
                }
            } catch (_e) { /* kein Batterie-State */ }

            const displayName = device.id !== device.ieee_address ? device.id : device.ieee_address;

            const res = {
                id: device.ieee_address,
                name: displayName,
                icon: device.icon || undefined,
                manufacturer: device.manufacturer || '',
                model: `${device.model || ''} ${device.modelDescription || ''}`.trim(),
                status,
                hasDetails: true,
                actions: [],
            };

            if (Array.isArray(device.states)) {
                const customItems   = {};   // kurze Labels → Kachel
                const detailItems   = {};   // lange Labels  → Detail-Tab
                const writeItems    = {};
                const scheduleItems = {};

                // Maximale Label-Länge für die Kachel ("Sum of produced energy" = 22 Zeichen)
                const MAX_CARD_LABEL_LEN = 30;

                for (const state of device.states) {
                    if (!state || !state.id) { continue; }
                    if (SKIP_STATES.has(state.id)) { continue; }
                    if (state.isEvent === true) { continue; }

                    const stateId = `${this.adapter.namespace}.${device.ieee_address}.${state.id}`;
                    const label   = state.name || state.id;
                    const unit    = state.unit || undefined;

                    const isSchedule = state.id.toLowerCase().includes('schedule') ||
                                       (state.name || '').toLowerCase().includes('schedule');

                    if (state.write) {
                        if (isSchedule) {
                            scheduleItems[state.id] = {
                                type: 'state', oid: stateId, foreign: true,
                                label, newLine: true, minRows: 3, maxRows: 20,
                            };
                        } else if (state.type === 'boolean') {
                            writeItems[state.id] = {
                                type: 'state', oid: stateId, foreign: true,
                                label, control: 'switch',
                                trueText: 'ON', falseText: 'OFF',
                                newLine: true,
                            };
                        } else if (state.type === 'number' && state.min != null && state.max != null) {
                            writeItems[state.id] = {
                                type: 'state', oid: stateId, foreign: true,
                                label, unit, control: 'slider',
                                min: state.min, max: state.max, newLine: true,
                            };
                        } else if (state.states) {
                            writeItems[state.id] = {
                                type: 'state', oid: stateId, foreign: true,
                                label, unit, control: 'select',
                                states: state.states, newLine: true,
                            };
                        } else {
                            writeItems[state.id] = {
                                type: 'state', oid: stateId, foreign: true,
                                label, unit, newLine: true,
                            };
                        }
                    } else if (state.read) {
                        if (SKIP_READ_STATES.has(state.id)) { continue; }
                        if (isSchedule) { continue; }
                        const stateName = state.name || '';
                        if (SKIP_NAME_PREFIXES.some(p => stateName.startsWith(p))) { continue; }

                        // Duplikat vermeiden: State bereits über write-Zweig erfasst → überspringen
                        if (writeItems[state.id]) { continue; }

                        // LoRaWAN-Muster: oid + foreign:true, Framework liest Live-Wert direkt
                        const item = {
                            type: 'state',
                            oid: stateId,
                            foreign: true,
                            label,
                            unit: unit ?? undefined,
                            ...(state.type === 'boolean' ? {
                                trueText:  '✔',
                                falseText: '✘',
                            } : {}),
                        };

                        if (label.length > MAX_CARD_LABEL_LEN) {
                            detailItems[state.id] = item;
                        } else {
                            customItems[state.id] = item;
                        }
                    }
                }

                // Items alphabetisch sortieren (wie LoRaWAN)
                if (Object.keys(customItems).length > 0) {
                    const sortedItems = Object.keys(customItems)
                        .sort((a, b) => a.localeCompare(b))
                        .reduce((acc, key) => { acc[key] = customItems[key]; return acc; }, {});

                    res.customInfo = {
                        id: device.ieee_address,
                        schema: { type: 'panel', items: sortedItems },
                    };
                }

                device._scheduleItems = scheduleItems;
                device._detailItems   = detailItems;

                if (Object.keys(writeItems).length > 0) {
                    res.actions.push({
                        id: 'control',
                        icon: 'settings',
                        description: 'Control device',
                        handler: async (_id, ctx) => {
                            await ctx.showForm(
                                { type: 'panel', label: displayName, items: writeItems },
                                { title: `Control – ${displayName}` },
                            );
                            return { refresh: false };
                        },
                    });
                }
            }

            context.addDevice(res);
        }

        context.complete();
    }

    /**
     * Gibt Schema und Daten für die Detailansicht eines einzelnen Geräts zurück.
     *
     * @param {string} id        Die IEEE-Adresse des Geräts
     * @param {object} _action   Das Action-Objekt vom dm-utils-Framework
     * @param {object} _context  Der Device-Management-Kontext
     */
    async getDeviceDetails(id, _action, _context) {
        this.adapter.log.debug(`getDeviceDetails: ${id}`);

        const device = this.deviceCache.find((d) => d.ieee_address === id);
        if (!device) { return null; }

        // Zeitstempel formatieren (wie LoRaWAN)
        const formatTs = (val) => {
            if (!val) { return '—'; }
            const ts = isNaN(Number(val)) ? new Date(val) : new Date(Number(val));
            if (isNaN(ts.getTime())) { return String(val); }
            return ts.toLocaleString('de-DE', {
                weekday: 'long', year: 'numeric', month: '2-digit', day: '2-digit',
                hour: '2-digit', minute: '2-digit', second: '2-digit',
            });
        };

        // Live-States lesen
        let lastSeenText    = '—';
        let linkQualityText = '—';
        let batteryText     = '—';
        let availableText   = '—';

        try {
            const s = await this.adapter.getStateAsync(`${device.ieee_address}.last_seen`);
            if (s && s.val != null && s.val !== '') { lastSeenText = formatTs(s.val); }
        } catch (_e) { /* ignorieren */ }

        try {
            const s = await this.adapter.getStateAsync(`${device.ieee_address}.link_quality`);
            if (s && s.val != null) { linkQualityText = `${s.val} / 255`; }
        } catch (_e) { /* ignorieren */ }

        try {
            const s = await this.adapter.getStateAsync(`${device.ieee_address}.battery`);
            if (s && s.val != null) { batteryText = `${s.val} %`; }
        } catch (_e) { /* ignorieren */ }

        try {
            const s = await this.adapter.getStateAsync(`${device.ieee_address}.available`);
            if (s) { availableText = s.val === true ? '✔  Online' : '✘  Offline'; }
        } catch (_e) { /* ignorieren */ }

        const displayName   = device.id !== device.ieee_address ? device.id : device.ieee_address;
        const scheduleItems = device._scheduleItems || {};
        const hasSchedule   = Object.keys(scheduleItems).length > 0;
        const detailItems   = device._detailItems   || {};
        const hasDetails    = Object.keys(detailItems).length > 0;

        /** @type {Record<string, any>} */
        const data = {};

        // ── Tab 1: Gerät ─────────────────────────────────────────────────────
        /** @type {Record<string, any>} */
        const infoItems = {};
        infoItems['_h1']    = { type: 'header',     text: 'Device Identity',  size: 4, newLine: true };
        infoItems['_d1']    = { type: 'divider',     color: 'primary' };
        infoItems['ieee']   = { type: 'staticInfo',  label: 'IEEE Address',   data: device.ieee_address,             size: 16, addColon: true, newLine: true };
        infoItems['fname']  = { type: 'staticInfo',  label: 'Friendly Name',  data: device.id,                       size: 16, addColon: true, newLine: true };
        infoItems['mfr']    = { type: 'staticInfo',  label: 'Manufacturer',   data: device.manufacturer  || '—',     size: 16, addColon: true, newLine: true };
        infoItems['model']  = { type: 'staticInfo',  label: 'Model',          data: device.model         || '—',     size: 16, addColon: true, newLine: true };
        infoItems['descr']  = { type: 'staticInfo',  label: 'Description',    data: device.modelDescription || '—',  size: 16, addColon: true, newLine: true };
        infoItems['pwr']    = { type: 'staticInfo',  label: 'Power Source',   data: device.powerSource   || '—',     size: 16, addColon: true, newLine: true };

        // ── Tab 2: Verbindung ─────────────────────────────────────────────────
        /** @type {Record<string, any>} */
        const connItems = {};
        connItems['_h1']    = { type: 'header',     text: 'Zigbee Connection',  size: 4, newLine: true };
        connItems['_d1']    = { type: 'divider',     color: 'primary' };
        connItems['avail']  = { type: 'staticInfo',  label: 'Status',           data: availableText,    size: 16, addColon: true, newLine: true };
        connItems['lq']     = { type: 'staticInfo',  label: 'Link Quality',     data: linkQualityText,  size: 16, addColon: true, newLine: true };
        connItems['ls']     = { type: 'staticInfo',  label: 'Last seen',        data: lastSeenText,     size: 16, addColon: true, newLine: true };
        if (batteryText !== '—') {
            connItems['batt'] = { type: 'staticInfo', label: 'Battery',         data: batteryText,      size: 16, addColon: true, newLine: true };
        }

        // ── Tab 3: Technisch ──────────────────────────────────────────────────
        /** @type {Record<string, any>} */
        const techItems = {};
        techItems['_h1']    = { type: 'header',    text: 'Zigbee Status',       size: 4, newLine: true };
        techItems['_d1']    = { type: 'divider',    color: 'primary' };
        techItems['interviewCompleted'] = { type: 'checkbox', label: 'Interview completed', readOnly: true, newLine: true };
        techItems['supported']          = { type: 'checkbox', label: 'Supported by Z2M',    readOnly: true, newLine: true };
        techItems['disabled']           = { type: 'checkbox', label: 'Disabled',            readOnly: true, newLine: true };

        data.interviewCompleted = !!device.interviewCompleted;
        data.supported          = !!device.supported;
        data.disabled           = !!device.disabled;

        // ── Tabs zusammenbauen ────────────────────────────────────────────────
        /** @type {Record<string, any>} */
        const tabs = {
            _tab_info: { type: 'panel', label: 'Device',     items: infoItems },
            _tab_conn: { type: 'panel', label: 'Connection', items: connItems },
            _tab_tech: { type: 'panel', label: 'Technical',  items: techItems },
        };

        // Values-Tab: States mit langen Labels
        if (hasDetails) {
            const sortedDetailItems = Object.keys(detailItems)
                .sort((a, b) => a.localeCompare(b))
                .reduce((acc, key) => { acc[key] = detailItems[key]; return acc; }, {});
            tabs._tab_values = {
                type: 'panel',
                label: 'Values',
                items: {
                    _h1: { type: 'header', text: 'Additional Values', size: 4, newLine: true },
                    _d1: { type: 'divider', color: 'primary' },
                    ...sortedDetailItems,
                },
            };
        }

        // Schedule-Tab: nur für Thermostate
        if (hasSchedule) {
            tabs._tab_schedule = {
                type: 'panel',
                label: 'Schedule',
                items: {
                    _h1: { type: 'header',  text: 'Weekly Schedule', size: 4, newLine: true },
                    _d1: { type: 'divider', color: 'primary' },
                    ...scheduleItems,
                },
            };
        }

        return {
            id: device.ieee_address,
            schema: { type: 'tabs', items: tabs },
            data,
        };
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
