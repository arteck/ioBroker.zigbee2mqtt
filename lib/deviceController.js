const states = require('./states').states;
const defineDeviceFromExposes = require('./exposes').defineDeviceFromExposes;
const utils = require('./utils');
const colors = require('./colors.js');
const rgb = require('./rgb.js');
//const createCache = {};

class DeviceController {
    constructor(adapter, deviceCache, groupCache, config, createCache) {
        this.adapter = adapter;
        this.groupCache = groupCache;
        this.deviceCache = deviceCache;
        this.config = config;
        this.createCache = createCache;
    }

    async createDeviceDefinitions(exposes) {
        utils.clearArray(this.deviceCache);
        for (const expose of exposes) {
            if (expose.definition != null) {
                // search for scenes in the endpoints and build them into an array
                let scenes = [];
                for (const key in expose.endpoints) {
                    if (expose.endpoints[key].scenes) {
                        scenes = scenes.concat(expose.endpoints[key].scenes);
                    }
                }
                // if the device is already present in the cache, remove it
                this.removeDeviceByIeee(this.deviceCache, expose.ieee_address);
                defineDeviceFromExposes(this.deviceCache, expose.friendly_name, expose.ieee_address, expose.definition, expose.power_source, scenes, this.config);
            }
        }
    }


    async defineGroupDevice(groupID, ieee_address, scenes) {
        const newDevice = {
            id: groupID,
            ieee_address: ieee_address,
            icon: undefined,
            states: [
                states.state,
                states.brightness,
                //states.color,
                states.brightness_move,
                states.colortemp_move,
            ],
        };

        const color = {
            id: 'color',
            prop: 'color',
            name: 'Color',
            icon: undefined,
            role: 'level.color.rgb',
            write: true,
            read: true,
            type: 'string',
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
        };

        // @ts-ignore
        newDevice.states.push(color);

        const colortemp = {
            id: 'colortemp',
            prop: 'color_temp',
            name: 'Color temperature',
            icon: undefined,
            role: 'level.color.temperature',
            write: true,
            read: true,
            type: 'number',
            min: this.config.useKelvin == true ? utils.miredKelvinConversion(500) : 150,
            max: this.config.useKelvin == true ? utils.miredKelvinConversion(150) : 500,
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
        };

        // @ts-ignore
        newDevice.states.push(colortemp);

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
            const deviceName = device.id == device.ieee_address ? '' : device.id;
            if (!this.createCache[device.ieee_address] || this.createCache[device.ieee_address].name != deviceName) {
                const deviceObj = {
                    type: 'device',
                    common: {
                        name: deviceName,
                    },

                    native: {}
                };

                if (!device.ieee_address.includes('group_')) {
                    deviceObj.common.statusStates = {
                        onlineId: `${this.adapter.name}.${this.adapter.instance}.${device.ieee_address}.available`
                    };
                }

                //@ts-ignore
                await this.adapter.extendObjectAsync(device.ieee_address, deviceObj);
                this.createCache[device.ieee_address] = { name: deviceName };
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
            this.adapter.setStateAsync(`${ieee_address}.available`, false, true);
            this.adapter.extendObject(`${ieee_address}`, { common: { name: 'Device removed!', } });
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
            'setter',
            'setterOpt',
            'getter',
            'setattr',
            'readable',
            'writable',
            'isOption',
            'inOptions',
            'isEvent',
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