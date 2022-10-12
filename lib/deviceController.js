const states = require('./states').states;
const defineDeviceFromExposes = require('./exposes').defineDeviceFromExposes;
const utils = require('./utils');
const createCache = {};

class DeviceController {
	constructor(adapter, deviceCache, groupCache, useKelvin) {
		this.adapter = adapter;
		this.groupCache = groupCache;
		this.deviceCache = deviceCache;
		this.useKelvin = useKelvin;
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
				await defineDeviceFromExposes(this.deviceCache, expose.friendly_name, expose.ieee_address, expose.definition, expose.power_source, scenes, this.useKelvin);
			}
		}
	}


	async defineGroupDevice(devices, groupID, ieee_address, scenes, useKelvin) {
		const newDevice = {
			id: groupID,
			ieee_address: ieee_address,
			icon: undefined,
			states: [
				states.state,
				states.brightness,
				states.color,
				states.brightness_move,
				states.colortemp_move,
			],
		};

		const colortemp = {
			id: 'colortemp',
			prop: 'color_temp',
			name: 'Color temperature',
			icon: undefined,
			role: 'level.color.temperature',
			write: true,
			read: true,
			type: 'number',
			min: useKelvin == true ? utils.miredKelvinConversion(500) : 150,
			max: useKelvin == true ? utils.miredKelvinConversion(150) : 500,
			unit: useKelvin == true ? 'K' : 'mired',
			setter: (value) => {
				return utils.toMired(value);
			},
			getter: (payload) => {
				if (useKelvin == true) {
					return utils.miredKelvinConversion(payload.color_temp);
				}
				else {
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
		utils.removeDeviceByIeee(devices, ieee_address);
		devices.push(newDevice);
	}
	async createGroupDefinitions(exposes) {
		utils.clearArray(this.groupCache);
		for (const expose of exposes) {
			await this.defineGroupDevice(this.groupCache, expose.friendly_name, `group_${expose.id}`, expose.scenes, this.useKelvin);
		}
	}

	async createOrUpdateDevices() {
		for (const device of this.groupCache.concat(this.deviceCache)) {
			const deviceName = device.id == device.ieee_address ? '' : device.id;
			if (!createCache[device.ieee_address] || createCache[device.ieee_address].common.name != deviceName) {
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
				createCache[device.ieee_address] = deviceObj;
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
				if (!createCache[device.ieee_address][state.id] || createCache[device.ieee_address][state.id].name != state.name) {
					const iobState = await this.copyAndCleanStateObj(state);
					await this.adapter.extendObjectAsync(`${device.ieee_address}.${state.id}`, {
						type: 'state',
						common: iobState,
						native: {},
					});
					createCache[device.ieee_address][state.id] = state.name;
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

	async processRemoveEvent(messageObj) {
		if (messageObj.payload && messageObj.payload.type == 'device_leave') {
			this.adapter.setStateAsync(`${messageObj.payload.data.ieee_address}.available`, false, true);
			this.adapter.extendObject(`${messageObj.payload.data.ieee_address}`, { common: { name: 'Device removed!', } });
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