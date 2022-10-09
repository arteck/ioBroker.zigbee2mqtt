const defineDeviceFromExposes = require('./exposes').defineDeviceFromExposes;
const defineGroupDevice = require('./groups').defineGroupDevice;
const clearArray = require('./utils').clearArray;
const createCache = {};

class DeviceController {
	constructor(adapter, deviceCache, groupCache, useKelvin) {
		this.adapter = adapter;
		this.groupCache = groupCache;
		this.deviceCache = deviceCache;
		this.useKelvin = useKelvin;
	}

	async createDeviceDefinitions(exposes) {
		clearArray(this.deviceCache);
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

	async createGroupDefinitions(exposes) {
		clearArray(this.groupCache);
		for (const expose of exposes) {
			await defineGroupDevice(this.groupCache, expose.friendly_name, `group_${expose.id}`, expose.scenes, this.useKelvin);
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
		renamedDevice.id = messageObj.payload.data.to;
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