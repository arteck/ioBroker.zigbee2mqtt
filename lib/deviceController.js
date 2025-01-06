const states = require('./states').states;
const createDeviceFromExposes = require('./exposes').createDeviceFromExposes;
const utils = require('./utils');
const colors = require('./colors.js');
const rgb = require('./rgb.js');
const ImageController = require('./imageController').ImageController;

class DeviceController {
    constructor(adapter, deviceCache, groupCache, config, logCustomizations, createCache) {
        this.adapter = adapter;
        this.groupCache = groupCache;
        this.deviceCache = deviceCache;
        this.config = config;
        this.logCustomizations = logCustomizations;
        this.createCache = createCache;
        this.imageController = new ImageController(adapter);
    }

    async createDeviceDefinitions(devicesMessage) {
        utils.clearArray(this.deviceCache);
        for (const devicesMessag of devicesMessage) {
            if (this.logCustomizations.debugDevices.includes(devicesMessag.ieee_address)) {
                this.adapter.log.warn(
                    `--->>> fromZ2M -> ${devicesMessag.ieee_address} exposes: ${JSON.stringify(devicesMessag)}`
                );
            }

            if (devicesMessag.definition != null) {
                // if the device is already present in the cache, remove it
                this.removeDeviceByIeee(this.deviceCache, devicesMessag.ieee_address);

                if (devicesMessag.definition.exposes) {
                    try {
                        const newDevice = await createDeviceFromExposes(devicesMessag, this.adapter);
                        newDevice.icon = await this.imageController.getDeviceIcon(devicesMessag);
                        this.deviceCache.push(newDevice);
                    } catch (err) {
                        this.adapter.log.warn(`Cannot ${devicesMessag.friendly_name} create Device from Exposes!`);
                        this.adapter.log.debug(JSON.stringify(devicesMessag));
                        this.adapter.log.debug(err);
                    }
                }
            }
        }
    }

    async defineGroupDevice(groupID, ieee_address, scenes) {
        const brmPropName =
			this.adapter.config.brightnessMoveOnOff == true ? 'brightness_move_onoff' : 'brightness_move';
        const brsPropName =
			this.adapter.config.brightnessStepOnOff == true ? 'brightness_step_onoff' : 'brightness_step';
        const newDevice = {
            id: groupID,
            ieee_address: ieee_address,
            icon: undefined, //  await imageController.getDeviceIcon(devicesMessag), device.definition.model
            optionsValues: {},
            states: [
                states.available,
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
                        let xy = [0, 0];
                        const rgbcolor = colors.ParseColor(value);
                        xy = rgb.rgb_to_cie(rgbcolor.r, rgbcolor.g, rgbcolor.b);
                        return {
                            x: xy[0],
                            y: xy[1],
                        };
                    },
                    getter: (payload) => {
                        if (payload.color_mode != 'xy' && this.config.colorTempSyncColor == false) {
                            return undefined;
                        }
                        if (payload.color && payload.color.x && payload.color.y) {
                            const colorval = rgb.cie_to_rgb(payload.color.x, payload.color.y);
                            return (
                                '#' +
								utils.decimalToHex(colorval[0]) +
								utils.decimalToHex(colorval[1]) +
								utils.decimalToHex(colorval[2])
                            );
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
                    min: this.config.useKelvin == true ? utils.miredKelvinConversion(550) : 150,
                    max: this.config.useKelvin == true ? utils.miredKelvinConversion(153) : 500,
                    def: this.config.useKelvin == true ? utils.miredKelvinConversion(153) : 500,
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
                name: scene.name,
                icon: undefined,
                role: 'button',
                write: true,
                read: true,
                def: true,
                type: 'boolean',
                setter: (value) => (value ? scene.id : undefined),
            };
            // @ts-ignore
            newDevice.states.push(sceneSate);
        }

        // if the device is already present in the cache, remove it
        this.removeDeviceByIeee(this.groupCache, ieee_address);
        this.groupCache.push(newDevice);
    }

    async createGroupDefinitions(groupsMessage) {
        utils.clearArray(this.groupCache);
        for (const groupMessage of groupsMessage) {
            if (this.logCustomizations.debugDevices.includes(groupMessage.id)) {
                this.adapter.log.warn(`--->>> fromZ2M -> ${groupMessage.id} exposes: ${JSON.stringify(groupMessage)}`);
            }
            await this.defineGroupDevice(groupMessage.friendly_name, `group_${groupMessage.id}`, groupMessage.scenes);
        }
    }

    async createOrUpdateDevices() {
        for (const device of this.groupCache.concat(this.deviceCache)) {
            let deviceName = await this.getDeviceName(device);
            let description = await this.getDeviceDescription(device);

            if (deviceName == '' && device.description) {
                deviceName = device.description;
                description = '';
            }

            // Manipulate deviceName if the device is disabled, so the update of the device is triggered as well
            if (device.disabled && device.disabled == true) {
                if (this.config.useEventInDesc == true) {
                    description = 'Device is disabled!';
                } else {
                    deviceName = `[Disabled] ${deviceName}`;
                }
            }

            if (!this.createCache[device.ieee_address] ||
		this.createCache[device.ieee_address].name != deviceName ||
		this.createCache[device.ieee_address].description != description) {
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
                        groupDevice: false,
                    },
                };

                // Group Device
                if (device.ieee_address.includes('group_')) {
                    deviceObj.native.groupDevice = true;
                    deviceObj.common.statusStates.onlineId = `${this.adapter.name}.${this.adapter.instance}.${device.ieee_address}.available`;
                }
                // Disabled Device
                else if (device.disabled || device.disabled == true) {
                    // Placeholder for possible later logic
                }
                // Only the onlineId is set if the device is not disabled
                else {
                    deviceObj.common.statusStates.onlineId = `${this.adapter.name}.${this.adapter.instance}.${device.ieee_address}.available`;
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
                if (device.states.find((x) => x.id == stateID) == null) {
                    this.adapter.delObject(sceneID);
                }
            }

            for (const state of device.states) {
                if (
                    state &&
					(!this.createCache[device.ieee_address][state.id] ||
						this.createCache[device.ieee_address][state.id].name != state.name)
                ) {
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
        const renamedDevice = this.groupCache
            .concat(this.deviceCache)
            .find((x) => x.id == messageObj.payload.data.from);
        if (renamedDevice) {
            renamedDevice.id = messageObj.payload.data.to;
        }
    }

    async checkAndProgressDeviceRemove() {
        let description = '';
        let deviceName = '';
        let iobDevices = await this.adapter.getDevicesAsync();
        // Do not consider devices already marked as "deviceRemoved"
        iobDevices = iobDevices.filter((x) => x.native.deviceRemoved == false);
        // Do not consider groups
        iobDevices = iobDevices.filter((x) => x.native.groupDevice == false);

        for (const iobDevice of iobDevices) {
            const ieee_address = iobDevice._id.split('.')[2];
            //Check whether the devices found from the object tree are also available in the DeviceCache
            if (!this.deviceCache.find((x) => x.ieee_address == ieee_address)) {
                deviceName = iobDevice.common.name;

                if (this.config.useEventInDesc == true) {
                    description = 'Device was removed!';
                } else {
                    deviceName = `[Removed] ${deviceName}`;
                }

                this.adapter.extendObject(`${ieee_address}`, {
                    common: {
                        name: deviceName,
                        desc: description,
                    },
                    native: {
                        deviceRemoved: true,
                    },
                });
                this.adapter.setStateChangedAsync(`${ieee_address}.available`, false, true);

                delete this.createCache[ieee_address];
            }
        }
    }

    removeDeviceByIeee(devices, ieee_address) {
        const idx = devices.findIndex((x) => x.ieee_address == ieee_address);
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

    getDeviceName(device) {
        return device.id == device.ieee_address ? '' : device.id;
    }

    getDeviceDescription(device) {
        return device.description ? device.description : '';
    }

    processCoordinatorCheck(payload) {
        if (payload && payload.data && payload.data.missing_routers) {
            const missingRoutersCount = payload.data.missing_routers.length;
            this.adapter.setState('info.missing_routers', JSON.stringify(payload.data.missing_routers), true);
            this.adapter.setState('info.missing_routers_count', missingRoutersCount, true);

            if (missingRoutersCount > 0) {
                this.adapter.log[this.config.coordinatorCheckLogLvl](
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
