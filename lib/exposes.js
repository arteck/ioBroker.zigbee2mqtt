 
// @ts-nocheck
'use strict';

const statesDefs = require('./states').states;
const rgb = require('./rgb');
const utils = require('./utils');
const colors = require('./colors');
const getNonGenDevStatesDefs = require('./nonGenericDevicesExtension').getStateDefinition;

// https://www.zigbee2mqtt.io/guide/usage/exposes.html#access
const z2mAccess = {
    /**
     * Bit 0: The property can be found in the published state of this device
     */
    STATE: 1,
    /**
     * Bit 1: The property can be set with a /set command
     */
    SET: 2,
    /**
     * Bit 2: The property can be retrieved with a /get command
     */
    GET: 4,
    /**
     * Bitwise inclusive OR of STATE and SET : 0b001 | 0b010
     */
    STATE_SET: 3,
    /**
     * Bitwise inclusive OR of STATE and GET : 0b001 | 0b100
     */
    STATE_GET: 5,
    /**
     * Bitwise inclusive OR of STATE and GET and SET : 0b001 | 0b100 | 0b010
     */
    ALL: 7,
};

function genState(expose, role, name, desc) {
    let state;
    const readable = (expose.access & z2mAccess.STATE) > 0;
    const writable = (expose.access & z2mAccess.SET) > 0;
    const stname = name || expose.property;

    if (typeof stname !== 'string') {
        return;
    }

    const stateId = stname.replace(/\*/g, '');
    const stateName = desc || expose.description || expose.name;
    const propName = expose.property;

    switch (expose.type) {
        case 'binary':
            state = {
                id: stateId,
                prop: propName,
                name: stateName,
                icon: undefined,
                role: role || 'state',
                write: writable,
                read: true,
                type: 'boolean',
            };

            if (readable) {
                state.getter = (payload) => payload[propName] === (expose.value_on || 'ON');
            } else {
                state.getter = (_payload) => undefined;
            }

            if (writable) {
                state.setter = (payload) =>
                    payload ? expose.value_on || 'ON' : expose.value_off != undefined ? expose.value_off : 'OFF';
                state.setattr = expose.property;
            }

            if (expose.endpoint) {
                state.epname = expose.endpoint;
            }
            break;

        case 'numeric':
            state = {
                id: stateId,
                prop: propName,
                name: stateName,
                icon: undefined,
                role: role || 'state',
                write: writable,
                read: true,
                type: 'number',
                min: expose.value_min,
                max: expose.value_max,
                unit: expose.unit,
            };

            if (expose.endpoint) {
                state.epname = expose.endpoint;
            }
            break;

        case 'enum':
            state = {
                id: stateId,
                prop: propName,
                name: stateName,
                icon: undefined,
                role: role || 'state',
                write: writable,
                read: true,
                states: {},
            };

            for (const val of expose.values) {
                // if a definition of a button (eg. Aqara presence detector FP1)
                if (val == '') {
                    state.states[propName] = propName;
                } else {
                    state.states[val] = val;
                }
                state.type = typeof val;
            }

            if (expose.endpoint) {
                state.epname = expose.endpoint;
                state.setattr = expose.name;
            }
            break;

        case 'text':
            state = {
                id: stateId,
                prop: propName,
                name: stateName,
                role: role || 'state',
                write: writable,
                read: true,
                type: 'string',
            };
            if (propName == 'action') {
                state.isEvent = true;
                state.getter = (payload) => {
                    return payload[propName];
                };
            }
            if (expose.endpoint) {
                state.epname = expose.endpoint;
            }
            break;

        default:
            break;
    }

    // Try to set the state defaults
    if (state && state.type) {
        switch (state.type) {
            case 'boolean':
                state.def = false;
                break;
            case 'number':
                state.def = state.min || 0;
                break;
            case 'object':
                state.def = {};
                break;
            case 'string':
                state.def = '';
                break;
        }
    }

    return state;
}

/**
 *
 * @param devicesMessag
 * @param adapter
 */
async function createDeviceFromExposes(devicesMessag, adapter) {
    const states = [];
    let scenes = [];
    const config = adapter.config;
    const deviceID = devicesMessag.friendly_name;
    const ieee_address = devicesMessag.ieee_address;
    const definition = devicesMessag.definition;
    const power_source = devicesMessag.power_source;
    const disabled = devicesMessag.disabled && devicesMessag.disabled == true;
    const description = devicesMessag.description ? devicesMessag.description : undefined;

    function pushToStates(state, access) {
        if (state === undefined) {
            return 0;
        }
        if (access === undefined) {
access = z2mAccess.ALL;
}
        state.readable = (access & z2mAccess.STATE) > 0;
        state.writable = (access & z2mAccess.SET) > 0;
        const stateExists = states.findIndex((x, _index, _array) => x.id === state.id);

        if (stateExists < 0) {
            state.write = state.writable;
            if (!state.writable) {
                if (state.hasOwnProperty('setter')) {
                    delete state.setter;
                }

                if (state.hasOwnProperty('setattr')) {
                    delete state.setattr;
                }
            }

            if (!state.readable) {
                if (state.hasOwnProperty('getter')) {
                    //to awid some worning on unprocessed data
                    state.getter = (_payload) => undefined;
                }
            }

            return states.push(state);
        } 
            if (state.readable && !states[stateExists].readable) {
                states[stateExists].read = state.read;
                // as state is readable, it can't be button or event
                if (states[stateExists].role === 'button') {
                    states[stateExists].role = state.role;
                }

                if (states[stateExists].hasOwnProperty('isEvent')) {
                    delete states[stateExists].isEvent;
                }

                // we have to use the getter from "new" state
                if (state.hasOwnProperty('getter')) {
                    states[stateExists].getter = state.getter;
                }

                // trying to remove the `prop` property, as main key for get and set,
                // as it can be different in new and old states, and leave only:
                // setattr for old and id for new
                if (state.hasOwnProperty('prop') && state.prop === state.id) {
                    if (states[stateExists].hasOwnProperty('prop')) {
                        if (states[stateExists].prop !== states[stateExists].id) {
                            if (!states[stateExists].hasOwnProperty('setattr')) {
                                states[stateExists].setattr = states[stateExists].prop;
                            }
                        }
                        delete states[stateExists].prop;
                    }
                } else if (state.hasOwnProperty('prop')) {
                    states[stateExists].prop = state.prop;
                }
                states[stateExists].readable = true;
            }

            if (state.writable && !states[stateExists].writable) {
                states[stateExists].write = state.writable;
                // use new state `setter`
                if (state.hasOwnProperty('setter')) {
                    states[stateExists].setter = state.setter;
                }

                // use new state `setterOpt`
                if (state.hasOwnProperty('setterOpt')) {
                    states[stateExists].setterOpt = state.setterOpt;
                }

                // use new state `inOptions`
                if (state.hasOwnProperty('inOptions')) {
                    states[stateExists].inOptions = state.inOptions;
                }

                // as we have new state, responsible for set, we have to use new `isOption`
                // or remove it
                if (
                    (!state.hasOwnProperty('isOption') || state.isOption === false) && states[stateExists].hasOwnProperty('isOption')) {
                    delete states[stateExists].isOption;
                } else {
                    states[stateExists].isOption = state.isOption;
                }

                // use new `setattr` or `prop` as `setattr`
                if (state.hasOwnProperty('setattr')) {
                    states[stateExists].setattr = state.setattr;
                } else if (state.hasOwnProperty('prop')) {
                    states[stateExists].setattr = state.prop;
                }

                // remove `prop` equal to if, due to prop is uses as key in set and get
                if (states[stateExists].prop === states[stateExists].id) {
                    delete states[stateExists].prop;
                }

                if (state.hasOwnProperty('epname')) {
                    states[stateExists].epname = state.epname;
                }
                states[stateExists].writable = true;
            }

            return states.length;
        
    }

    // search for scenes in the endpoints and build them into an array
    for (const key in devicesMessag.endpoints) {
        if (devicesMessag.endpoints[key].scenes) {
            scenes = scenes.concat(devicesMessag.endpoints[key].scenes);
        }
    }
    try {
        for (const expose of definition.exposes) {
            let state;

            switch (expose.type) {
                case 'light':
                    for (const prop of expose.features) {
                        switch (prop.name) {
                            case 'state': {
                                const stateName = expose.endpoint ? `state_${expose.endpoint}` : 'state';
                                pushToStates(
                                    {
                                        id: stateName,
                                        name: `Switch state ${expose.endpoint ? expose.endpoint : ''}`.trim(),
                                        options: ['transition'],
                                        icon: undefined,
                                        role: 'switch',
                                        write: true,
                                        read: true,
                                        type: 'boolean',
                                        getter: (payload) => payload[stateName] === (prop.value_on || 'ON'),
                                        setter: (value) =>
                                            value
                                                ? prop.value_on || 'ON'
                                                : prop.value_off != undefined
                                                    ? prop.value_off
                                                    : 'OFF',
                                        epname: expose.endpoint,
                                        //setattr: stateName,
                                    },
                                    prop.access
                                );
                                // features contains TOGGLE?
                                if (prop.value_toggle) {
                                    pushToStates({
                                        id: `${stateName}_toggle`,
                                        prop: `${stateName}_toggle`,
                                        name: `Toggle state of the ${stateName}`,
                                        options: ['transition'],
                                        icon: undefined,
                                        role: 'button',
                                        write: true,
                                        read: true,
                                        type: 'boolean',
                                        def: true,
                                        setattr: stateName,
                                        setter: (value) => (value ? prop.value_toggle : undefined),
                                    });
                                }
                                break;
                            }
                            case 'brightness': {
                                const stateName = expose.endpoint ? `brightness_${expose.endpoint}` : 'brightness';
                                pushToStates(
                                    {
                                        id: stateName,
                                        name: `Brightness ${expose.endpoint ? expose.endpoint : ''}`.trim(),
                                        options: ['transition'],
                                        icon: undefined,
                                        role: 'level.dimmer',
                                        write: true,
                                        read: true,
                                        type: 'number',
                                        min: 0, // ignore expose.value_min
                                        max: 100, // ignore expose.value_max
                                        def: 100,
                                        unit: '%',
                                        getter: (value) => {
                                            return utils.bulbLevelToAdapterLevel(value[stateName]);
                                        },
                                        setter: (value) => {
                                            return utils.adapterLevelToBulbLevel(value);
                                        },
                                    },
                                    prop.access
                                );
                                // brightnessMoveOnOff
                                const brmPropName =
									config.brightnessMoveOnOff == true
									    ? `${stateName}_move_onoff`
									    : `${stateName}_move`;
                                pushToStates(
                                    {
                                        id: `${stateName}_move`,
                                        prop: brmPropName,
                                        name: 'Increases or decreases the brightness by X units per second',
                                        icon: undefined,
                                        role: 'state',
                                        write: true,
                                        read: false,
                                        type: 'number',
                                        min: -50,
                                        max: 50,
                                        def: 0,
                                    },
                                    z2mAccess.SET
                                );
                                // brightnessStepOnOff
                                const brspropName =
									config.brightnessStepOnOff == true
									    ? `${stateName}_step_onoff`
									    : `${stateName}_step`;
                                pushToStates(
                                    {
                                        id: `${stateName}_step`,
                                        prop: brspropName,
                                        name: 'Increases or decreases brightness by X steps',
                                        options: ['transition'],
                                        icon: undefined,
                                        role: 'state',
                                        write: true,
                                        read: false,
                                        type: 'number',
                                        min: -255,
                                        max: 255,
                                        def: 0,
                                    },
                                    z2mAccess.SET
                                );
                                break;
                            }
                            case 'color_temp': {
                                const stateName = expose.endpoint ? `colortemp_${expose.endpoint}` : 'colortemp';
                                const propName = expose.endpoint ? `color_temp_${expose.endpoint}` : 'color_temp';
                                const colorMode = expose.endpoint ? `color_mode_${expose.endpoint}` : 'color_mode';
                                pushToStates(
                                    {
                                        id: stateName,
                                        prop: propName,
                                        name: `Color temperature ${expose.endpoint ? expose.endpoint : ''}`.trim(),
                                        options: ['transition'],
                                        icon: undefined,
                                        role: 'level.color.temperature',
                                        write: true,
                                        read: true,
                                        type: 'number',
                                        min:
                    											config.useKelvin == true
                    											    ? utils.miredKelvinConversion(prop.value_max)
                    											    : prop.value_min,
                                        max:
                    											config.useKelvin == true
                    											    ? utils.miredKelvinConversion(prop.value_min)
                    											    : prop.value_max,
                                        def:
                    											config.useKelvin == true
                    											    ? utils.miredKelvinConversion(prop.value_min)
                    											    : prop.value_max,
                                        unit: config.useKelvin == true ? 'K' : 'mired',
                                        setter: (value) => {
                                            return utils.toMired(value);
                                        },
                                        getter: (payload) => {
                                            if (payload[colorMode] != 'color_temp') {
                                                return undefined;
                                            }
                                            if (config.useKelvin == true) {
                                                return utils.miredKelvinConversion(payload[propName]);
                                            } 
                                                return payload[propName];
                                            
                                        },
                                    },
                                    prop.access
                                );
                                // Colortemp
                                pushToStates(
                                    {
                                        id: `${stateName}_move`,
                                        prop: `${propName}_move`,
                                        name: 'Colortemp change',
                                        icon: undefined,
                                        role: 'state',
                                        write: true,
                                        read: false,
                                        type: 'number',
                                        min: -50,
                                        max: 50,
                                        def: 0,
                                    },
                                    prop.access
                                );
                                break;
                            }
                            case 'color_temp_startup': {
                                //const stateName = expose.endpoint
                                //    ? `colortempstartup_${expose.endpoint}`
                                //    : 'colortempstartup';
                                const propName = expose.endpoint
                                    ? `color_temp_startup_${expose.endpoint}`
                                    : 'color_temp_startup';
                                //const colorMode = expose.endpoint ? `color_mode_${expose.endpoint}` : 'color_mode';
                                pushToStates(
                                    {
                                        id: propName,
                                        prop: propName,
                                        name: `${prop.description} ${expose.endpoint ? `(${expose.endpoint})` : ''}`.trim(),
                                        //options: ['transition'],
                                        icon: undefined,
                                        role: 'level',                   // Changed role to level to avoid double level.temperature in one device
                                        write: true,
                                        read: true,
                                        type: 'number',
                                        min: 0,
                                        max: 65535,
                                        def: undefined,
                                        unit: config.useKelvin == true ? 'K' : 'mired',
                                        setter: (value) => {
                                            return utils.toMired(value);
                                        },
                                        getter: (payload) => {
                                            //if (payload[colorMode] != 'color_temp') {
                                            //    return undefined;
                                            //}
                                            if (config.useKelvin == true) {
                                                return utils.miredKelvinConversion(payload[propName]);
                                            } 
                                                return payload[propName];
                                            
                                        },
                                    },
                                    prop.access
                                );
                                break;
                            }
                            case 'color_xy': {
                                const stateName = expose.endpoint ? `color_${expose.endpoint}` : 'color';
                                const colorMode = expose.endpoint ? `color_mode_${expose.endpoint}` : 'color_mode';
                                pushToStates(
                                    {
                                        id: stateName,
                                        name: `Color ${expose.endpoint ? expose.endpoint : ''}`.trim(),
                                        options: ['transition'],
                                        icon: undefined,
                                        role: 'level.color.rgb',
                                        write: true,
                                        read: true,
                                        type: 'string',
                                        def: '#ff00ff',
                                        setter: (value) => {
                                            let xy = [0, 0];
                                            const rgbcolor = colors.ParseColor(value);

                                            xy = rgb.rgb_to_cie(rgbcolor.r, rgbcolor.g, rgbcolor.b);
                                            return {
                                                x: xy[0],
                                                y: xy[1],
                                            };
                                        },
                                        getter: (payload) => {
                                            if (payload[colorMode] != 'xy' && config.colorTempSyncColor == false) {
                                                return undefined;
                                            }
                                            if (
                                                payload[stateName] &&
                        												payload[stateName].hasOwnProperty('x') &&
                        												payload[stateName].hasOwnProperty('y')
                                            ) {
                                                const colorval = rgb.cie_to_rgb(
                                                    payload[stateName].x,
                                                    payload[stateName].y
                                                );
                                                return (
                                                    `#${ 
                          													utils.decimalToHex(colorval[0]) 
                          													}${utils.decimalToHex(colorval[1]) 
                          													}${utils.decimalToHex(colorval[2])}`
                                                );
                                            } 
                                                return undefined;
                                            
                                        },
                                        epname: expose.endpoint,
                                    },
                                    prop.access
                                );
                                break;
                            }
                            case 'color_hs': {
                                const stateName = expose.endpoint ? `color_${expose.endpoint}` : 'color';
                                const colorMode = expose.endpoint ? `color_mode_${expose.endpoint}` : 'color_mode';
                                pushToStates(
                                    {
                                        id: stateName,
                                        name: `Color ${expose.endpoint ? expose.endpoint : ''}`.trim(),
                                        options: ['transition'],
                                        icon: undefined,
                                        role: 'level.color.rgb',
                                        write: true,
                                        read: true,
                                        type: 'string',
                                        def: '#ff00ff',
                                        setter: (value) => {
                                            const _rgb = colors.ParseColor(value);
                                            const hsv = rgb.rgbToHSV(_rgb.r, _rgb.g, _rgb.b, true);
                                            return {
                                                h: Math.min(Math.max(hsv.h, 1), 359),
                                                s: hsv.s,
                                                //b: Math.round(hsv.v * 2.55),
                                            };
                                        },
                                        getter: (payload) => {
                                            if (
                                                !['hs', 'xy'].includes(payload[colorMode]) &&
												config.colorTempSyncColor == false
                                            ) {
                                                return undefined;
                                            }

                                            if (
                                                payload[stateName] &&
												payload[stateName].hasOwnProperty('h') &&
												payload[stateName].hasOwnProperty('s') &
													payload[stateName].hasOwnProperty('b')
                                            ) {
                                                return rgb.hsvToRGBString(
                                                    payload[stateName].h,
                                                    payload[stateName].s,
                                                    Math.round(payload[stateName].b / 2.55)
                                                );
                                            }

                                            if (
                                                payload[stateName] &&
												payload[stateName].hasOwnProperty('x') &&
												payload[stateName].hasOwnProperty('y')
                                            ) {
                                                const colorval = rgb.cie_to_rgb(
                                                    payload[stateName].x,
                                                    payload[stateName].y
                                                );
                                                return (
                                                    `#${ 
													utils.decimalToHex(colorval[0]) 
													}${utils.decimalToHex(colorval[1]) 
													}${utils.decimalToHex(colorval[2])}`
                                                );
                                            }
                                            return undefined;
                                        },
                                    },
                                    prop.access
                                );
                                break;
                            }
                            default:
                                pushToStates(genState(prop), prop.access);
                                break;
                        }
                    }
                    pushToStates(statesDefs.transition, z2mAccess.SET);
                    break;

                case 'switch':
                    for (const prop of expose.features) {
                        switch (prop.name) {
                            case 'state':
                                pushToStates(genState(prop, 'switch'), prop.access);
                                // features contains TOGGLE?
                                if (prop.value_toggle) {
                                    pushToStates({
                                        id: `${prop.property}_toggle`,
                                        prop: `${prop.property}_toggle`,
                                        name: `Toggle state of the ${prop.property}`,
                                        icon: undefined,
                                        role: 'button',
                                        write: true,
                                        read: true,
                                        type: 'boolean',
                                        def: true,
                                        setattr: prop.property,
                                        setter: (value) => (value ? prop.value_toggle : undefined),
                                    });
                                }
                                break;
                            default:
                                pushToStates(genState(prop), prop.access);
                                break;
                        }
                    }
                    break;

                case 'numeric':
                    if (expose.endpoint) {
                        state = genState(expose);
                    } else {
                        switch (expose.name) {
                            case 'linkquality':
                                state = statesDefs.link_quality;
                                break;

                            case 'battery':
                                state = statesDefs.battery;
                                break;

                            case 'temperature':
                                state = statesDefs.temperature;
                                break;

                            case 'device_temperature':
                                state = statesDefs.device_temperature;
                                break;

                            case 'humidity':
                                state = statesDefs.humidity;
                                break;

                            case 'pressure':
                                state = statesDefs.pressure;
                                break;

                            case 'illuminance':
                                state = statesDefs.illuminance;
                                break;

                            case 'illuminance_lux':
                                state = statesDefs.illuminance;
                                break;

                            case 'power':
                                state = statesDefs.load_power;
                                break;

                            case 'current':
                                state = statesDefs.load_current;
                                break;

                            case 'voltage':
                                state = statesDefs.voltage;
                                if (power_source == 'Battery') {
                                    state = statesDefs.battery_voltage;
                                }
                                if (expose.unit == 'mV') {
                                    state.getter = (payload) => payload.voltage / 1000;
                                }
                                break;

                            case 'energy':
                                state = statesDefs.energy;
                                break;

                            default:
                                state = genState(expose);
                                break;
                        }
                    }
                    if (state) {
pushToStates(state, expose.access);
}
                    break;

                case 'enum':
                    switch (expose.name) {
                        case 'action': {
                            if (!Array.isArray(expose.values)) {
                                break;
                            }

                            // Support for DIYRuZ Device
                            const wildcardValues = expose.values.filter((x) => x.startsWith('*'));
                            if (wildcardValues && wildcardValues.length > 0) {
                                for (const endpointName of [
                                    ...new Set(definition.exposes.filter((x) => x.endpoint).map((x) => x.endpoint)),
                                ]) {
                                    for (const value of wildcardValues) {
                                        const actionName = value.replace('*', endpointName);
                                        pushToStates(
                                            {
                                                id: actionName,
                                                prop: 'action',
                                                name: `Triggered action ${value.replace('*_', endpointName)}`,
                                                icon: undefined,
                                                role: 'button',
                                                write: false,
                                                read: true,
                                                type: 'boolean',
                                                def: false,
                                                isEvent: true,
                                                getter: (payload) => (payload.action === actionName ? true : undefined),
                                            },
                                            expose.access
                                        );
                                    }
                                }
                                break;
                            }

                            for (const actionName of expose.values) {
                                // is release -> hold state? - skip
                                if (
                                    config.simpleHoldReleaseState == true &&
									actionName.endsWith('release') &&
									expose.values.find((x) => x == actionName.replace('release', 'hold'))
                                ) {
                                    continue;
                                }

                                // is stop - move state? - skip
                                if (
                                    config.simpleMoveStopState == true &&
									actionName.endsWith('stop') &&
									expose.values.find((x) => x.includes(actionName.replace('stop', 'move')))
                                ) {
                                    continue;
                                }

                                // is release -> press state? - skip
                                if (
                                    config.simplePressReleaseState == true &&
									actionName.endsWith('release') &&
									expose.values.find((x) => x == actionName.replace('release', 'press'))
                                ) {
                                    continue;
                                }

                                // is hold -> release state ?
                                if (
                                    config.simpleHoldReleaseState == true &&
									actionName.endsWith('hold') &&
									expose.values.find((x) => x == actionName.replace('hold', 'release'))
                                ) {
                                    pushToStates(
                                        {
                                            id: actionName.replace(/\*/g, ''),
                                            prop: 'action',
                                            name: actionName,
                                            icon: undefined,
                                            role: 'button',
                                            write: false,
                                            read: true,
                                            def: false,
                                            type: 'boolean',
                                            getter: (payload) => {
                                                if (payload.action === actionName) {
                                                    return true;
                                                }
                                                if (payload.action === actionName.replace('hold', 'release')) {
                                                    return false;
                                                }
                                                if (payload.action === `${actionName}_release`) {
                                                    return false;
                                                }
                                                return undefined;
                                            },
                                        },
                                        expose.access
                                    );
                                }
                                // is move -> stop state ?
                                else if (
                                    config.simpleMoveStopState == true &&
									actionName.includes('move') &&
									expose.values.find((x) => x == `${actionName.split('_')[0]}_stop`)
                                ) {
                                    pushToStates(
                                        {
                                            id: actionName.replace(/\*/g, ''),
                                            prop: 'action',
                                            name: actionName,
                                            icon: undefined,
                                            role: 'button',
                                            write: false,
                                            read: true,
                                            def: false,
                                            type: 'boolean',
                                            getter: (payload) => {
                                                if (payload.action === actionName) {
                                                    return true;
                                                }
                                                if (payload.action === `${actionName.split('_')[0]}_stop`) {
                                                    return false;
                                                }
                                                return undefined;
                                            },
                                        },
                                        expose.access
                                    );
                                }
                                // is press -> release  state ?
                                else if (
                                    config.simplePressReleaseState == true &&
									actionName.endsWith('press') &&
									expose.values.find((x) => x == actionName.replace('press', 'release'))
                                ) {
                                    pushToStates(
                                        {
                                            id: actionName.replace(/\*/g, ''),
                                            prop: 'action',
                                            name: actionName,
                                            icon: undefined,
                                            role: 'button',
                                            write: false,
                                            read: true,
                                            def: false,
                                            type: 'boolean',
                                            getter: (payload) => {
                                                if (payload.action === actionName) {
                                                    return true;
                                                }
                                                if (payload.action === actionName.replace('press', 'release')) {
                                                    return false;
                                                }
                                                return undefined;
                                            },
                                        },
                                        expose.access
                                    );
                                } else if (actionName == 'color_temperature_move') {
                                    pushToStates(
                                        {
                                            id: 'color_temperature_move',
                                            prop: 'action',
                                            name: 'Color temperature move value',
                                            icon: undefined,
                                            role: 'level.color.temperature',
                                            write: false,
                                            read: true,
                                            type: 'number',
                                            def: config.useKelvin == true ? utils.miredKelvinConversion(150) : 500,
                                            min: config.useKelvin == true ? utils.miredKelvinConversion(500) : 150,
                                            max: config.useKelvin == true ? utils.miredKelvinConversion(150) : 500,
                                            unit: config.useKelvin == true ? 'K' : 'mired',
                                            isEvent: true,
                                            getter: (payload) => {
                                                if (payload.action != 'color_temperature_move') {
                                                    return undefined;
                                                }

                                                if (payload.action_color_temperature) {
                                                    if (config.useKelvin == true) {
                                                        return utils.miredKelvinConversion(
                                                            payload.action_color_temperature
                                                        );
                                                    } 
                                                        return payload.action_color_temperature;
                                                    
                                                }
                                            },
                                        },
                                        expose.access
                                    );
                                } else if (actionName == 'color_move') {
                                    pushToStates(
                                        {
                                            id: 'color_move',
                                            prop: 'action',
                                            name: 'Color move value',
                                            icon: undefined,
                                            role: 'level.color.rgb',
                                            write: false,
                                            read: true,
                                            type: 'string',
                                            def: '#ffffff',
                                            isEvent: true,
                                            getter: (payload) => {
                                                if (payload.action != 'color_move') {
                                                    return undefined;
                                                }

                                                if (
                                                    payload.action_color &&
													payload.action_color.hasOwnProperty('x') &&
													payload.action_color.hasOwnProperty('y')
                                                ) {
                                                    const colorval = rgb.cie_to_rgb(
                                                        payload.action_color.x,
                                                        payload.action_color.y
                                                    );
                                                    return (
                                                        `#${ 
														utils.decimalToHex(colorval[0]) 
														}${utils.decimalToHex(colorval[1]) 
														}${utils.decimalToHex(colorval[2])}`
                                                    );
                                                } 
                                                    return undefined;
                                                
                                            },
                                        },
                                        expose.access
                                    );
                                } else if (actionName == 'brightness_move_to_level') {
                                    pushToStates(
                                        {
                                            id: 'brightness_move_to_level',
                                            name: 'Brightness move to level',
                                            icon: undefined,
                                            role: 'level.dimmer',
                                            write: false,
                                            read: true,
                                            type: 'number',
                                            min: 0,
                                            max: 100,
                                            def: 100,
                                            unit: '%',
                                            isEvent: true,
                                            getter: (payload) => {
                                                if (payload.action != 'brightness_move_to_level') {
                                                    return undefined;
                                                }

                                                if (payload.action_level) {
                                                    return utils.bulbLevelToAdapterLevel(payload.action_level);
                                                } 
                                                    return undefined;
                                                
                                            },
                                        },
                                        expose.access
                                    );
                                } else if (actionName == 'move_to_saturation') {
                                    pushToStates(
                                        {
                                            id: 'move_to_saturation',
                                            name: 'Move to level saturation',
                                            icon: undefined,
                                            role: 'level.color.saturation',
                                            write: false,
                                            read: true,
                                            type: 'number',
                                            // min: 0,
                                            // max: 100,
                                            def: 0,
                                            isEvent: true,
                                            getter: (payload) => {
                                                if (payload.action != 'move_to_saturation') {
                                                    return undefined;
                                                }

                                                if (payload.action_level) {
                                                    return payload.action_saturation;
                                                } 
                                                    return undefined;
                                                
                                            },
                                        },
                                        expose.access
                                    );
                                } else if (actionName == 'enhanced_move_to_hue_and_saturation') {
                                    pushToStates(
                                        {
                                            id: 'enhanced_move_to_hue_and_saturation',
                                            prop: 'action',
                                            name: 'Enhanced move to hue and saturation value',
                                            icon: undefined,
                                            role: 'level.color.hue',
                                            write: false,
                                            read: true,
                                            type: 'number',
                                            min: 0,
                                            max: 65536,
                                            def: 0,
                                            isEvent: true,
                                            getter: (payload) => {
                                                if (payload.action != 'enhanced_move_to_hue_and_saturation') {
                                                    return undefined;
                                                }

                                                if (payload.action_enhanced_hue) {
                                                    return payload.action_enhanced_hue;
                                                } 
                                                    return undefined;
                                                
                                            },
                                        },
                                        expose.access
                                    );
                                }
                                // else if (actionName == 'hue_move') {
                                //     pushToStates({
                                //         id: 'hue_move',
                                //         name: 'Hue move rate',
                                //         icon: undefined,
                                //         role: 'level.color.hue',
                                //         write: false,
                                //         read: true,
                                //         type: 'number',
                                //         min: 0,
                                //         max: 360,
                                //         def: 0,
                                //         isEvent: true,
                                //         getter: (payload) => {
                                //             if (payload.action != 'hue_move') {
                                //                 return undefined;
                                //             }

                                //             if (payload.action_level) {
                                //                 return payload.action_level;
                                //             } else {
                                //                 return undefined;
                                //             }
                                //         }
                                //     }, expose.access);
                                // }
                                else {
                                    pushToStates(
                                        {
                                            id: actionName.replace(/\*/g, ''),
                                            prop: 'action',
                                            name: actionName,
                                            icon: undefined,
                                            role: 'button',
                                            write: false,
                                            read: true,
                                            type: 'boolean',
                                            def: false,
                                            isEvent: true,
                                            getter: (payload) => (payload.action === actionName ? true : undefined),
                                        },
                                        expose.access
                                    );
                                }
                            }
                            // Can the device simulated_brightness?
                            if (
                                definition.options &&
								definition.options.find((x) => x.property == 'simulated_brightness')
                            ) {
                                pushToStates(statesDefs.simulated_brightness, z2mAccess.STATE);
                            }
                            state = null;
                            break;
                        }
                        default:
                            state = genState(expose);
                            break;
                    }
                    if (state) {
pushToStates(state, expose.access);
}
                    break;

                case 'binary':
                    if (expose.endpoint) {
                        state = genState(expose);
                    } else {
                        switch (expose.name) {
                            case 'contact':
                                state = statesDefs.contact;
                                pushToStates(statesDefs.opened, expose.access);
                                break;

                            case 'battery_low':
                                state = statesDefs.batt_low_t_f;
                                break;

                            case 'tamper':
                                state = statesDefs.tamper;
                                break;

                            case 'water_leak':
                                state = statesDefs.water_leak;
                                break;

                            case 'lock':
                                state = statesDefs.child_lock;
                                break;

                            case 'occupancy':
                                state = statesDefs.occupancy;
                                break;

                            default:
                                state = genState(expose);
                                break;
                        }
                    }
                    if (state) {
pushToStates(state, expose.access);
}
                    break;

                case 'text':
                    state = genState(expose);
                    pushToStates(state, expose.access);
                    break;

                case 'lock':
                case 'fan':
                case 'cover':
                    for (const prop of expose.features) {
                        switch (prop.name) {
                            case 'state':
                                pushToStates(genState(prop, 'switch'), prop.access);
                                // features contains TOGGLE?
                                if (prop.value_toggle) {
                                    pushToStates({
                                        id: `${prop.property}_toggle`,
                                        prop: `${prop.property}_toggle`,
                                        name: `Toggle state of the ${prop.property}`,
                                        icon: undefined,
                                        role: 'button',
                                        write: true,
                                        read: true,
                                        def: true,
                                        type: 'boolean',
                                        setattr: prop.property,
                                        setter: (value) => (value ? prop.value_toggle : undefined),
                                    });
                                }
                                break;
                            default:
                                pushToStates(genState(prop), prop.access);
                                break;
                        }
                    }
                    break;

                case 'climate':
                    for (const prop of expose.features) {
                        switch (prop.name) {
                            case 'away_mode':
                                pushToStates(statesDefs.climate_away_mode, prop.access);
                                break;
                            case 'system_mode':
                                pushToStates(statesDefs.climate_system_mode, prop.access);
                                break;
                            case 'running_mode':
                                pushToStates(statesDefs.climate_running_mode, prop.access);
                                break;
                            case 'local_temperature':
                                pushToStates(statesDefs.local_temperature, prop.access);
                                break;
                            case 'local_temperature_calibration':
                                pushToStates(statesDefs.local_temperature_calibration, prop.access);
                                break;
                            default:
                                {
                                    if (prop.name.includes('heating_setpoint')) {
                                        pushToStates(genState(prop, 'level.temperature'), prop.access);
                                    } else {
                                        pushToStates(genState(prop), prop.access);
                                    }
                                }
                                break;
                        }
                    }
                    break;

                case 'composite': {
                    const options = [];
                    for (const prop of expose.features) {
                        prop.type = 'text'; // to avoid problems with numbers, booleans, etc.

                        const state = genState(prop);
                        // Workaround for FP1 new state (region_upsert)
                        if (!state) {
                            break;
                        }

                        state.prop          = expose.property;
                        state.inOptions     = true;
                        state.isOption      = true;

                        if (expose.access & z2mAccess.STATE) {
                            state.getter = (payload) => {
                                if (
                                    payload.hasOwnProperty(expose.property) &&
                                    payload[expose.property] !== null &&
                                    payload[expose.property].hasOwnProperty(prop.property)
                                ) {
                                    return !isNaN(payload[expose.property][prop.property])
                                        ? payload[expose.property][prop.property]
                                        : undefined;
                                } 
                                    return undefined;
                                
                            };
                        } else {
                            state.getter = (payload) => {
                                return payload[expose.property][prop.property];
                            };
                        }

                        pushToStates(state, z2mAccess.STATE);
                    }

                    break;
                }
                default:
                    console.log(`Unhandled expose type ${expose.type} for device ${deviceID}`);
            }
        }
    } catch (err) {
        console.log(`ERROR in expose for device ${deviceID} : ${err}`);
    }

    // If necessary, add states defined for this device model.
    // Unfortunately this is necessary for some device models because they do not adhere to the standard
    for (const state of getNonGenDevStatesDefs(definition.model)) {
        pushToStates(state, state.write ? z2mAccess.SET : z2mAccess.STATE);
    }

    // Add default states
    pushToStates(statesDefs.available, z2mAccess.STATE);
    pushToStates(statesDefs.last_seen, z2mAccess.STATE);
    pushToStates(statesDefs.send_payload, z2mAccess.SET);

    // Create buttons for scenes
    for (const scene of scenes) {
        pushToStates({
            id: `scene_${scene.id}`,
            prop: `scene_recall`,
            name: scene.name,
            icon: undefined,
            role: 'button',
            write: true,
            read: true,
            def: true,
            type: 'boolean',
            setter: (value) => (value ? scene.id : undefined),
        });
    }

    const newDevice = {
        id: deviceID,
        ieee_address: ieee_address,
        power_source: power_source,
        disabled: disabled,
        description: description,
        optionsValues: {},
        states: states,
    };

    return newDevice;
}

module.exports = {
    createDeviceFromExposes: createDeviceFromExposes,
};
