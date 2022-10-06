const defineDeviceFromExposes = require('./exposes').defineDeviceFromExposes;
const defineGroupDevice = require('./groups').defineGroupDevice;
const clearArray = require('./utils').clearArray;

async function createDeviceDefinitions(cache, exposes, useKelvin) {
	clearArray(cache);
	for (const expose of exposes) {
		if (expose.definition != null) {
			// search for scenes in the endpoints and build them into an array
			let scenes = [];
			for (const key in expose.endpoints) {
				if (expose.endpoints[key].scenes) {
					scenes = scenes.concat(expose.endpoints[key].scenes);
				}
			}
			await defineDeviceFromExposes(cache, expose.friendly_name, expose.ieee_address, expose.definition, expose.power_source, scenes, useKelvin);
		}
	}
}

async function createGroupDefinitions(cache, exposes, useKelvin) {
	clearArray(cache);
	for (const expose of exposes) {
		await defineGroupDevice(cache, expose.friendly_name, `group_${expose.id}`, expose.scenes, useKelvin);
	}
}

async function createOrUpdateDevices(adapter, cache, createCache) {
	for (const device of cache) {
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
					onlineId: `${adapter.name}.${adapter.instance}.${device.ieee_address}.available`
				};
			}

			//@ts-ignore
			await adapter.extendObjectAsync(device.ieee_address, deviceObj);
			createCache[device.ieee_address] = deviceObj;
		}

		// Here it is checked whether the scenes match the current data from z2m.
		// If necessary, scenes are automatically deleted from ioBroker.
		const sceneStates = await adapter.getStatesAsync(`${device.ieee_address}.scene_*`);
		const sceneIDs = Object.keys(sceneStates);
		for (const sceneID of sceneIDs) {
			const stateID = sceneID.split('.')[3];
			if (device.states.find(x => x.id == stateID) == null) {
				adapter.delObject(sceneID);
			}
		}

		for (const state of device.states) {
			if (!createCache[device.ieee_address][state.id] || createCache[device.ieee_address][state.id].name != state.name) {
				const iobState = await copyAndCleanStateObj(state);
				await adapter.extendObjectAsync(`${device.ieee_address}.${state.id}`, {
					type: 'state',
					common: iobState,
					native: {},
				});
				createCache[device.ieee_address][state.id] = state.name;
			}
		}
	}
}

async function copyAndCleanStateObj(state) {
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

module.exports = {
	createDeviceDefinitions: createDeviceDefinitions,
	createGroupDefinitions: createGroupDefinitions,
	createOrUpdateDevices: createOrUpdateDevices,
	copyAndCleanStateObj: copyAndCleanStateObj,
};