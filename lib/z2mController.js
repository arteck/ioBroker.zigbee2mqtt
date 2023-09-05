class Z2mController {
    constructor(adapter, deviceCache, groupCache, logCustomizations) {
        this.adapter = adapter;
        this.groupCache = groupCache;
        this.deviceCache = deviceCache;
        this.logCustomizations = logCustomizations;
    }

    async createZ2MMessage(id, state) {
        const splitedID = id.split('.');
        if (splitedID.length < 4) {
            this.adapter.log.warn(`state ${id} not valid`);
            return;
        }

        if (id.endsWith('info.coordinator_check')) {
            return { topic: 'bridge/request/coordinator_check', payload: '' };
        }

        const ieee_address = splitedID[2];
        const stateName = splitedID[3];

        const device = this.groupCache.concat(this.deviceCache).find(d => d.ieee_address == ieee_address);
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

        if (deviceState.setattr) {
            stateID = deviceState.setattr;
        }

        const controlObj = {
            payload: {
                [stateID]: stateVal,
            },
            topic: `${device.id}/set`
        };

        if (stateID == 'send_payload') {
            try {
                controlObj.payload = JSON.parse(stateVal);
                this.adapter.setState(id, state, true);
            }
            catch (error) {
                controlObj.payload = stateVal.replaceAll(' ', '').replaceAll('\n', '');
                this.adapter.log.warn(`${device.ieee_address} state: ${stateID} error: value passed is not a valid JSON`);
                this.adapter.log.debug(`${device.ieee_address} states: ${JSON.stringify(controlObj)} error: ${error}`);
                return;
            }
        }

        // if available read option and set payload
        if (deviceState.options) {
            for (const option of deviceState.options) {
                // if optionsValues not set, set it!
                if (!device.optionsValues[option]) {
                    const optionValue = (await this.adapter.getStateAsync(`${splitedID[0]}.${splitedID[1]}.${splitedID[2]}.${option}`)).val;
                    // optionsValues Cache
                    device.optionsValues[option] = optionValue;
                }

                // if transition value == -1 it will be ignored. -1 stands for no overwrite!
                if (option == 'transition' && device.optionsValues[option] == -1) {
                    continue;
                }

                controlObj.payload[option] = device.optionsValues[option];
            }
        }

        // If an option datapoint has been set, it does not have to be sent.
        // This is confirmed directly by the adapter (ack = true)
        if (deviceState.isOption && deviceState.isOption == true) {
            // set optionsValues 'Cache'
            device.optionsValues[stateName] = state.val;
            this.adapter.setState(id, state, true);
            return;
        }

        // set stats with the mentioned roles or always immediately to ack = true, because these are not reported back by Zigbee2MQTT
        if (['button'].includes(deviceState.role)) {
            this.adapter.setState(id, state, true);
        }
        // set stats with the mentioned ids always immediately to ack = true, because these are not reported back by Zigbee2MQTT
        if (['brightness_move', 'colortemp_move', 'brightness_move', 'brightness_step', 'effect'].includes(deviceState.id)) {
            this.adapter.setState(id, state, true);
        }

        if (this.logCustomizations.debugDevices.includes(device.ieee_address)) {
            this.adapter.log.warn(`<<<--- toZ2M -> ${device.ieee_address} states: ${JSON.stringify(controlObj)}`);
        }
        return controlObj;
    }

    async proxyZ2MLogs(messageObj) {
        const logMessage = messageObj.payload.message;
        if (this.logCustomizations.logfilter.some(x => logMessage.includes(x))) {
            return;
        }

        const logLevel = messageObj.payload.level;
        switch (logLevel) {
            case 'debug':
            case 'info':
            case 'error':
                this.adapter.log[logLevel](logMessage);
                break;
            case 'warning':
                this.adapter.log.warn(logMessage);
                break;
        }
    }
}


module.exports = {
    Z2mController: Z2mController
};