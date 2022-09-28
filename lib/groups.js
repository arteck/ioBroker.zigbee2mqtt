const states = require('./states').states;
const utils = require('./utils');

function createGroupDevice(devices, groupID, ieee_address, scenes) {
	const newDevice = {
		id: groupID,
		ieee_address: ieee_address,
		icon: undefined,
		states: [
			states.state,
			states.brightness,
			states.colortemp,
			states.color,
			states.brightness_move,
			states.colortemp_move,
			states.transition_time,
			//states.brightness_step
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
	createGroupDevice: createGroupDevice,
};
