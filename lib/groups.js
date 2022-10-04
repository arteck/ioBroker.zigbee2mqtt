const states = require('./states').states;
const utils = require('./utils');

function defineGroupDevice(devices, groupID, ieee_address, scenes, useKelvin) {
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

module.exports = {
	defineGroupDevice: defineGroupDevice,
};
