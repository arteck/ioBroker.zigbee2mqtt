const nonGenDevStatesDefs = {
    // https://www.zigbee2mqtt.io/devices/HG06467.html#trigger-effects
    HG06467: [
        {
            id: 'effect',
            prop: 'effect',
            name: 'effect',
            icon: undefined,
            role: 'state',
            write: true,
            read: true,
            type: 'string',
            def: '{"effect":{"effect":"snake","speed":100,"colors":[{"r":255,"g":0,"b":0},{"r":0,"g":255,"b":0},{"r":0,"g":0,"b":255}]}}',
            setter: (value) => {
                try {
                    const valObj = JSON.parse(value);
                    if (valObj.effect && valObj.effect.effect) {
                        return valObj.effect;
                    }
                    return valObj;
                } catch (error) {
                    return undefined;
                }
            },
            getter: (payload) => {
                if (!payload.effect) {
                    return undefined;
                }
                return JSON.stringify(payload.effect);
            },
        },
    ],
};

function getStateDefinition(model) {
    const stateDef = nonGenDevStatesDefs[model];
    if (stateDef) {
        return stateDef;
    } else {
        return [];
    }
}

module.exports = {
    getStateDefinition,
};
