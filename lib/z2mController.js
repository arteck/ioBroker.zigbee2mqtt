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

        const controlObj = {
            payload: {
                [stateID]: stateVal
            },
            topic: `${device.id}/set`
        };

        // set stats with the mentioned role or ids always immediately to ack = true, because these are not reported back by Zigbee2MQTT
        if (['button'].includes(deviceState.role) || ['brightness_move', 'color_temp_move'].includes(stateID)) {
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