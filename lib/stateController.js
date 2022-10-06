async function processDeviceMessage(adapter, messageObj, cache, debugDevices) {
	adapter.logDebug(`processDeviceMessage -> messageObj: ${JSON.stringify(messageObj)}`);
	// Is payload present?
	if (messageObj.payload == '') {
		return;
	}

	const device = cache.find(x => x.id == messageObj.topic);
	if (device) {
		adapter.logDebug(`processDeviceMessage -> device: ${JSON.stringify(device)}`);
		try {
			setDeviceState(adapter, messageObj, device, debugDevices);
		} catch (error) {
			adapter.log.error(error);
		}
	}
	else {
		adapter.log.warn(`Device: ${messageObj.topic} not found`);
	}
}

async function setDeviceState(adapter, messageObj, device, debugDevices) {
	if (debugDevices.includes(device.ieee_address)) {
		adapter.log.warn(`--->>> fromZ2M -> ${device.ieee_address} states: ${JSON.stringify(messageObj)}`);
	}

	for (const [key, value] of Object.entries(messageObj.payload)) {
		adapter.logDebug(`setDeviceState -> key: ${key}`);
		adapter.logDebug(`setDeviceState -> value: ${JSON.stringify(value)}`);

		let states;
		if (key == 'action') {
			states = device.states.filter(x => (x.prop && x.prop == key));
		} else {
			states = device.states.filter(x => (x.prop && x.prop == key) || x.id == key);
		}
		adapter.logDebug(`setDeviceState -> states: ${JSON.stringify(states)}`);

		for (const state of states) {
			if (!state) {
				continue;
			}

			const stateName = `${device.ieee_address}.${state.id}`;

			try {
				if (state.isEvent) {
					if (state.getter) {
						await setStateWithTimeoutAsync(adapter, stateName, state.getter(messageObj.payload), 300);
					}
					else {
						await setStateWithTimeoutAsync(adapter, stateName, value, 300);
					}
				}
				else {
					if (state.getter) {
						await setStateAsync(adapter, stateName, state.getter(messageObj.payload));
					}
					else {
						await setStateAsync(adapter, stateName, value);
					}
				}
			} catch (err) {
				adapter.log.warn(`Can not set ${stateName}`);
			}
		}
	}
}

async function setStateAsync(adapter, stateName, value) {
	if (value !== undefined) {
		await adapter.setStateAsync(stateName, value, true);
	}
}

async function setStateWithTimeoutAsync(adapter, stateName, value, timeout) {
	if (value !== undefined) {
		await adapter.setStateAsync(stateName, value, true);
		setTimeout(() => {
			adapter.setStateAsync(stateName, !value, true);
		}, timeout);
	}

}

module.exports = {
	processDeviceMessage: processDeviceMessage,
	setDeviceState: setDeviceState,
};