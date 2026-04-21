/**
 *
 */
class Z2mController {
    /**
     *
     * @param adapter
     * @param deviceCache
     * @param groupCache
     * @param logCustomizations
     */
    constructor(adapter, deviceCache, groupCache, logCustomizations) {
        this.adapter = adapter;
        this.groupCache = groupCache;
        this.deviceCache = deviceCache;
        this.logCustomizations = logCustomizations;
    }

    /**
     *
     * @param id
     * @param state
     */
    async createZ2MMessage(id, state) {
        const splitedID = id.split('.');
        if (splitedID.length < 4) {
            this.adapter.log.warn(`state ${id} not valid`);
            return;
        }

        if (id.endsWith('info.coordinator_check')) {
            // Fix 1: Z2M erwartet JSON-Objekt {} nicht leeren String ''
            return { topic: 'bridge/request/coordinator_check', payload: {} };
        }

        const ieee_address = splitedID[2];
        const stateName = splitedID[3];

        const device = this.groupCache.concat(this.deviceCache).find((d) => d.ieee_address === ieee_address);
        if (!device) {
            return;
        }

        const deviceState = device.states.find((s) => s.id === stateName);
        if (!deviceState) {
            return;
        }

        let stateVal = state.val;
        if (deviceState.setter) {
            // Fix 3: setter kann crashen (z.B. ungültiger Farbwert) → try/catch
            try {
                stateVal = deviceState.setter(state.val);
            } catch (err) {
                this.adapter.log.warn(`${device.ieee_address} state: ${stateName} setter error: ${err.message || err}`);
                return;
            }
        }

        // Fix 5: wenn setter undefined zurückgibt (z.B. Toggle-Release) → nichts senden
        if (stateVal === undefined) {
            this.adapter.log.debug(`${device.ieee_address} state: ${stateName} setter returned undefined, skipping`);
            return;
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
            topic: `${device.id}/set`,
        };

        if (stateID === 'send_payload') {
            try {
                controlObj.payload = JSON.parse(stateVal);
                this.adapter.setState(id, state.val, true);
            } catch (error) {
                // Fix 9: rawStr als String direkt als payload – wird in main.js via
                // JSON.stringify() nochmals gewrappt → würde doppelt quoten.
                // Stattdessen: Fehler loggen und NICHT senden (ungültiges JSON bleibt ungültig)
                this.adapter.log.warn(
                    `${device.ieee_address} state: ${stateID} error: value passed is not a valid JSON – not sent`
                );
                this.adapter.log.debug(`${device.ieee_address} raw value: ${stateVal}`);
                return;
            }
        }

        // if available read option and set payload
        if (deviceState.options) {
            for (const option of deviceState.options) {
                // Fix 2: Cache-Check mit === undefined statt !value
                // Falsy-Check schlägt bei 0, false, null fehl (z.B. transition=0 = sofort)
                if (device.optionsValues[option] === undefined) {
                    const optState = await this.adapter.getStateAsync(`${splitedID[0]}.${splitedID[1]}.${splitedID[2]}.${option}`);
                    device.optionsValues[option] = optState ? optState.val : null;
                }

                if (option === 'transition' && device.optionsValues[option] === -1) {
                    continue;
                }

                controlObj.payload[option] = device.optionsValues[option];
            }
        }

        // If an option datapoint has been set, it does not have to be sent.
        // This is confirmed directly by the adapter (ack = true)
        if (deviceState.isOption) {
            // set optionsValues 'Cache'
            device.optionsValues[stateName] = state.val;
            this.adapter.setState(id, state.val, true);
            return;
        }

        // States die nicht von Z2M zurückgemeldet werden → sofort ack=true setzen
        const immediateAckRole = ['button'].includes(deviceState.role);
        const immediateAckId = ['brightness_move', 'colortemp_move', 'brightness_step', 'effect'].includes(deviceState.id);
        if (immediateAckRole || immediateAckId) {
            this.adapter.setState(id, state.val, true);
        }

        if (this.logCustomizations.debugDevices) {
            const debugList = String(this.logCustomizations.debugDevices).split(',').map((s) => s.trim());
            if (debugList.includes(device.ieee_address)) {
                this.adapter.log.warn(`<<<--- toZ2M -> ${device.ieee_address} states: ${JSON.stringify(controlObj)}`);
            }
        }
        return controlObj;
    }

    /**
     *
     * @param messageObj
     */
    async proxyZ2MLogs(messageObj) {
        const logMessage = messageObj.payload && messageObj.payload.message;
        if (!logMessage) {
            return;
        }
        if (this.logCustomizations.logfilter.some((x) => logMessage.includes(x))) {
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
            default:
                this.adapter.log.debug(`Z2M [${logLevel}]: ${logMessage}`);
                break;
        }
    }
}

module.exports = {
    Z2mController: Z2mController,
};
