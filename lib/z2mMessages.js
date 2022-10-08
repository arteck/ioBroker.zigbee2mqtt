async function createZ2MMessage(adapter, id, state, cache, isConnected) {
	const splitedID = id.split('.');
	if (splitedID.length < 4) {
		adapter.log.warn(`state ${id} not valid`);
		return;
	}

	const ieee_address = splitedID[2];
	const stateName = splitedID[3];

	const device = cache.find(d => d.ieee_address == ieee_address);
	if (!device) {
		return;
	}

	const deviceState = device.states.find(s => s.id == stateName);
	if (!deviceState) {
		return;
	}

	let stateVal = state.val;
	if (deviceState.setter) {
		stateVal = deviceState.setter(state.val);
	}

	let stateID = deviceState.id;
	if (deviceState.prop) {
		stateID = deviceState.prop;
	}

	let topic = `${device.ieee_address}/set`;
	if (device.ieee_address.includes('group_')) {
		topic = `${device.id}/set`;
	}

	const controlObj = {
		payload: {
			[stateID]: stateVal
		},
		topic: topic
	};
	// set stats with the mentioned role or ids always immediately to ack = true, because these are not reported back by Zigbee2MQTT
	if (isConnected == true && (['button'].includes(deviceState.role) || ['brightness_move', 'color_temp_move'].includes(stateID))) {
		adapter.setState(id, state, true);
	}

	return controlObj;
}

async function proxyZ2MLogs(adapter, messageObj, logfilter) {
	adapter.logDebug(`proxyZ2MLogs -> messageObj: ${JSON.stringify(messageObj)}`);

	const logMessage = messageObj.payload.message;
	if (logfilter.some(x => logMessage.includes(x))) {
		return;
	}

	const logLevel = messageObj.payload.level;
	switch (logLevel) {
		case 'debug':
		case 'info':
		case 'error':
			adapter.log[logLevel](logMessage);
			break;
		case 'warning':
			adapter.log.warn(logMessage);
			break;
	}
}

module.exports = {
	createZ2MMessage: createZ2MMessage,
	proxyZ2MLogs: proxyZ2MLogs,
};