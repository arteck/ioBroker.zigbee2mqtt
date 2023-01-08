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

        const ieee_address = splitedID[2];
        const stateName = splitedID[3];

        let device = this.deviceCache.find(d => d.ieee_address == ieee_address);
        if (!device) {
            device = this.groupCache.find(d => d.ieee_address == ieee_address);
            if (!device) {
                return;
            }
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

        // if available read option and set payload
        if (deviceState.options) {
            for (const option of deviceState.options) {
                let optionValue;
                // if optionsValues not set, set it!
                if (!device.optionsValues[option]) {
                    optionValue = (await this.adapter.getStateAsync(`${splitedID[0]}.${splitedID[1]}.${splitedID[2]}.${option}`)).val;
                    // optionsValues Cache
                    device.optionsValues[option] = optionValue;
                }
                // if transition value == -1 it will be ignored. -1 stands for no overwrite!
                if (option == 'transition' && optionValue == -1) {
                    continue;
                }
                controlObj.payload[option] = optionValue;
            }
        }

        // If an option datapoint has been set, it does not have to be sent.
        // This is confirmed directly by the adapter (ack = true)
        if (deviceState.isOption && deviceState.isOption == true) {
            // set optionsValues 'Cache'
            device.optionsValues[stateName] = state;
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