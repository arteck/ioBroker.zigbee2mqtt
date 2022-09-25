const states = require('./states').states;

function createGroupDevice(devices, groupID, ieee_address) {

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

	devices.push(newDevice);
}

module.exports = {
	createGroupDevice: createGroupDevice,
};
