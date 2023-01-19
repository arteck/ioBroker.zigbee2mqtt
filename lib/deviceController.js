const states = require('./states').states;
const createDeviceFromExposes = require('./exposes').createDeviceFromExposes;
const utils = require('./utils');
const colors = require('./colors.js');
const rgb = require('./rgb.js');
//const createCache = {};

class DeviceController {
    constructor(adapter, deviceCache, groupCache, config, logCustomizations, createCache) {
        this.adapter = adapter;
        this.groupCache = groupCache;
        this.deviceCache = deviceCache;
        this.config = config;
        this.logCustomizations = logCustomizations;
        this.createCache = createCache;
    }

    async createDeviceDefinitions(devicesMessage) {
        utils.clearArray(this.deviceCache);
        for (const devicesMessag of devicesMessage) {
            if (this.logCustomizations.debugDevices.includes(devicesMessag.ieee_address)) {
                this.adapter.log.warn(`--->>> fromZ2M -> ${devicesMessag.ieee_address} exposes: ${JSON.stringify(devicesMessag)}`);
            }

            if (devicesMessag.definition != null) {
                // if the device is already present in the cache, remove it
                this.removeDeviceByIeee(this.deviceCache, devicesMessag.ieee_address);

                if (devicesMessag.definition.exposes) {
                    const newDevice = createDeviceFromExposes(devicesMessag, this.config);
                    this.deviceCache.push(newDevice);
                }
            }
        }
    }


    async defineGroupDevice(groupID, ieee_address, scenes) {
        const brmPropName = this.adapter.config.brightnessMoveOnOff == true ? 'brightness_move_onoff' : 'brightness_move';
        const brsPropName = this.adapter.config.brightnessStepOnOff == true ? 'brightness_step_onoff' : 'brightness_step';
        const newDevice = {
            id: groupID,
            ieee_address: ieee_address,
            icon: undefined,
            optionsValues: {},
            states: [
                states.brightness,
                states.colortemp_move,
                states.transition,
                {
                    id: 'state',
                    prob: 'state',
                    name: 'Switch state',
                    options: ['transition'],
                    icon: undefined,
                    role: 'switch',
                    write: true,
                    read: true,
                    type: 'boolean',
                    def: false,
                    getter: payload => (payload.state === 'ON'),
                    setter: (value) => (value) ? 'ON' : 'OFF',
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
                    def: 0
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
                    def: 0
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
                        let xy = [0, 0];
                        const rgbcolor = colors.ParseColor(value);
                        xy = rgb.rgb_to_cie(rgbcolor.r, rgbcolor.g, rgbcolor.b);
                        return {
                            x: xy[0],
                            y: xy[1]
                        };
                    },
                    getter: payload => {
                        if (payload.color_mode != 'xy' && this.config.colorTempSyncColor == false) {
                            return undefined;
                        }
                        if (payload.color && payload.color.x && payload.color.y) {
                            const colorval = rgb.cie_to_rgb(payload.color.x, payload.color.y);
                            return '#' + utils.decimalToHex(colorval[0]) + utils.decimalToHex(colorval[1]) + utils.decimalToHex(colorval[2]);
                        } else {
                            return undefined;
                        }
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
                    min: this.config.useKelvin == true ? utils.miredKelvinConversion(500) : 150,
                    max: this.config.useKelvin == true ? utils.miredKelvinConversion(150) : 500,
                    def: this.config.useKelvin == true ? utils.miredKelvinConversion(150) : 500,
                    unit: this.config.useKelvin == true ? 'K' : 'mired',
                    setter: (value) => {
                        return utils.toMired(value);
                    },
                    getter: (payload) => {
                        if (payload.color_mode != 'color_temp') {
                            return undefined;
                        }
                        if (this.config.useKelvin == true) {
                            return utils.miredKelvinConversion(payload.color_temp);
                        } else {
                            return payload.color_temp;
                        }
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
                    setter: (value) => (value) ? 'TOGGLE' : undefined
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
                    states: { blink: 'blink', breathe: 'breathe', okay: 'okay', channel_change: 'channel_change', finish_effect: 'finish_effect', stop_effect: 'stop_effect' }
                },
            ],
        };

        // Create buttons for scenes
        for (const scene of scenes) {
            const sceneSate = {
                id: `scene_${scene.id}`,
                prop: `scene_recall`,
                name: scene.name,
                icon: undefined,
                role: 'button',
                write: true,
                read: true,
                def: true,
                type: 'boolean',
                setter: (value) => (value) ? scene.id : undefined
            };
            // @ts-ignore
            newDevice.states.push(sceneSate);
        }

        // if the device is already present in the cache, remove it
        this.removeDeviceByIeee(this.groupCache, ieee_address);
        this.groupCache.push(newDevice);
    }

    async createGroupDefinitions(exposes) {
        utils.clearArray(this.groupCache);
        for (const expose of exposes) {
            await this.defineGroupDevice(expose.friendly_name, `group_${expose.id}`, expose.scenes);
        }
    }

    async createOrUpdateDevices() {
        for (const device of this.groupCache.concat(this.deviceCache)) {
            let deviceName = device.id == device.ieee_address ? '' : device.id;
            let description = device.description ? device.description : '';

            if (deviceName == '' && device.description) {
                deviceName = device.description;
                description = '';
            }

            // Manipulate deviceName if the device is disabled, so the update of the device is triggered as well
            if (device.disabled && device.disabled == true) {
                description = 'Device is disabled!';
                //deviceName = `[Disabled] ${deviceName}`;
            }

            if (!this.createCache[device.ieee_address] || this.createCache[device.ieee_address].name != deviceName || this.createCache[device.ieee_address].description != description) {
                const deviceObj = {
                    type: 'device',
                    common: {
                        name: deviceName,
                        desc: description
                    },

                    native: {}
                };

                // Only the onlineId is set if the device is not disabled and is not a group
                if (!device.ieee_address.includes('group_') && (!device.disabled || device.disabled == false)) {
                    deviceObj.common.statusStates = {
                        onlineId: `${this.adapter.name}.${this.adapter.instance}.${device.ieee_address}.available`
                    };
                }
                else {
                    deviceObj.common.statusStates = {
                        onlineId: ''
                    };
                }

                //@ts-ignore
                await this.adapter.extendObjectAsync(device.ieee_address, deviceObj);
                this.createCache[device.ieee_address] = { name: deviceName, description: description };
            }

            // Here it is checked whether the scenes match the current data from z2m.
            // If necessary, scenes are automatically deleted from ioBroker.
            const sceneStates = await this.adapter.getStatesAsync(`${device.ieee_address}.scene_*`);
            const sceneIDs = Object.keys(sceneStates);
            for (const sceneID of sceneIDs) {
                const stateID = sceneID.split('.')[3];
                if (device.states.find(x => x.id == stateID) == null) {
                    this.adapter.delObject(sceneID);
                }
            }

            for (const state of device.states) {
                if (!this.createCache[device.ieee_address][state.id] || this.createCache[device.ieee_address][state.id].name != state.name) {
                    const iobState = {
                        type: 'state',
                        common: await this.copyAndCleanStateObj(state),
                        native: {},
                    };

                    await this.adapter.extendObjectAsync(`${device.ieee_address}.${state.id}`, iobState);
                    this.createCache[device.ieee_address][state.id] = { name: state.name, created: true };
                }
            }
        }
    }

    async renameDeviceInCache(messageObj) {
        const renamedDevice = this.groupCache.concat(this.deviceCache).find(x => x.id == messageObj.payload.data.from);
        if (renamedDevice) {
            renamedDevice.id = messageObj.payload.data.to;
        }
    }

    processRemoveEvent(messageObj) {
        let ieee_address = undefined;
        if (messageObj.payload && messageObj.payload.type == 'device_leave') {
            ieee_address = messageObj.payload.data.ieee_address;
        }

        //{"data":{"block":false,"force":true,"id":"0xa4c138c954baaf54"},"status":"ok","transaction":"zhvjf-5"}
        if (messageObj.payload && messageObj.payload.data) {
            const device = this.deviceCache.find(x => x.id == messageObj.payload.data.id);
            if (device) {
                ieee_address = device.ieee_address;
            }
        }

        if (ieee_address != undefined) {
            this.adapter.setState(`${ieee_address}.available`, false, true);
            this.adapter.extendObject(`${ieee_address}`, { common: { desc: 'Device was removed!', } });
            delete this.createCache[ieee_address];
        }
    }

    removeDeviceByIeee(devices, ieee_address) {
        const idx = devices.findIndex(x => x.ieee_address == ieee_address);
        if (idx > -1) {
            devices.splice(idx, 1);
        }
    }

    async copyAndCleanStateObj(state) {
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
}

module.exports = {
    DeviceController
};