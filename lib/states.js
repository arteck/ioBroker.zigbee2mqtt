'use strict';

/*eslint no-unused-vars: ['off']*/

const utils = require('./utils.js');

/* states for device:
   id - sysname of state, id
   name - display name of state
   prop - attr name of payload object with value of state
   icon - url of state icon
   role - state role
   write, read - allow to write and read state from admin
   type - type of value
   isEvent - sign of clearing the value after 300ms
   isOption - if state is internal setting, not to be sent to device
   inOptions - if true, value of this state will be included in options argument of other states setter(Opt)
   getter - result of call is the value of state. if value is undefined - state not apply
   setter - result of call is the value for publish to zigbee
   setterOpt - result of call is the options for publish to zigbee
   setattr - name of converter to zigbee, if it different from "prop" value
   epname - endpoint name for publish
   lazy - if true, then the state will not be created until the first event for the specified state arrives
*/

const nameLookup = {
    C: 'temperature',
    '%': 'humidity',
    m: 'altitude',
    Pa: 'pressure',
    ppm: 'quality',
    psize: 'particle_size',
    V: 'voltage',
    A: 'current',
    Wh: 'energy',
    W: 'power',
    Hz: 'frequency',
    pf: 'power_factor',
    lx: 'illuminance_lux',
};

const unitLookup = {
    temperature: 'C',
    humidity: '%',
    altitude: 'm',
    pressure: 'Pa',
    quality: 'ppm',
    particle_size: 'psize',
    voltage: 'V',
    current: 'A',
    energy: 'Wh',
    power: 'W',
    frequency: 'Hz',
    power_factor: 'pf',
    illuminance_lux: 'lx',
};

const states = {
    link_quality: {
        id: 'link_quality',
        prop: 'linkquality',
        name: 'Link quality',
        icon: undefined,
        role: 'state',
        write: false,
        read: true,
        type: 'number',
        def: 0,
        min: 0,
        max: 255,
    },

    available: {
        id: 'available',
        prop: 'available',
        name: 'Available',
        icon: undefined,
        role: 'indicator.reachable',
        write: false,
        read: true,
        type: 'boolean',
        def: false,
    },

    last_seen: {
        id: 'last_seen',
        prop: 'last_seen',
        name: 'The date/time of last Zigbee message',
        icon: undefined,
        role: 'state',
        write: false,
        read: true,
        type: 'string',
        def: '',
        getter: (payload) => {
            const val = payload.last_seen;
            if (val == null) {
                return undefined;
            }
            // Z2M kann last_seen als Unix-Timestamp (number in ms) ODER als ISO-String senden
            if (typeof val === 'number') {
                return new Date(val).toISOString().replace('T', ' ').split('.')[0];
            }
            if (typeof val === 'string') {
                return val.replace('T', ' ').split('+')[0].split('.')[0];
            }
            return String(val);
        },
    },

    simulated_brightness: {
        id: 'simulated_brightness',
        prop: 'brightness',
        name: 'Simulated brightness',
        icon: undefined,
        role: 'level.dimmer',
        write: true,
        read: true,
        type: 'number',
        def: 0,
        unit: '%',
        // Fix: null-Guard – bulbLevelToAdapterLevel(undefined) würde 0 liefern (Lampe scheinbar aus)
        getter: (payload) => {
            if (payload.brightness == null) { return undefined; }
            return utils.bulbLevelToAdapterLevel(payload.brightness);
        },
    },

    // Fix: prop ergänzt – statesController sucht zuerst per state.prop === payload-key
    state: {
        id: 'state',
        prop: 'state',
        name: 'Switch state',
        icon: undefined,
        role: 'switch',
        write: true,
        read: true,
        type: 'boolean',
        def: false,
        getter: (payload) => payload.state === 'ON',
        setter: (value) => (value ? 'ON' : 'OFF'),
    },

    brightness: {
        id: 'brightness',
        prop: 'brightness',
        name: 'Brightness',
        options: ['transition'],
        icon: undefined,
        role: 'level.dimmer',
        write: true,
        read: true,
        type: 'number',
        def: 100,
        unit: '%',
        min: 0,
        max: 100,
        // Fix: null-Guard – payload ohne brightness-Key liefert sonst fälschlich 0
        getter: (payload) => {
            if (payload.brightness == null) { return undefined; }
            return utils.bulbLevelToAdapterLevel(payload.brightness);
        },
        setter: (value) => utils.adapterLevelToBulbLevel(value),
    },

    brightness_move: {
        id: 'brightness_move',
        prop: 'brightness_move',
        name: 'Dimming',
        icon: undefined,
        role: 'state',
        write: true,
        read: false,
        type: 'number',
        def: 0,
        min: -50,
        max: 50,
    },

    colortemp_move: {
        id: 'colortemp_move',
        prop: 'color_temp_move',
        name: 'Colortemp change',
        icon: undefined,
        role: 'state',
        write: true,
        read: false,
        type: 'number',
        def: 0,
        min: -50,
        max: 50,
    },

    transition: {
        id: 'transition',
        prop: 'transition',
        name: 'Transition time overwrite (-1 disabled)',
        icon: undefined,
        role: 'state',
        write: true,
        read: false,
        type: 'number',
        def: -1,
        unit: 'sec',
        min: -1,
        max: 65535,
        isOption: true,
    },

    send_payload: {
        id: 'send_payload',
        name: 'Send a raw json payload',
        icon: undefined,
        role: 'json',
        write: true,
        read: false,
        type: 'string',
        def: '{}',
    },

    // Fix: prop ergänzt – Z2M sendet payload.voltage
    voltage: {
        id: 'voltage',
        prop: 'voltage',
        name: 'Voltage',
        icon: undefined,
        role: 'value.voltage',
        write: false,
        read: true,
        type: 'number',
        def: 0,
        unit: 'V',
    },

    // Fix: prop ergänzt – Z2M sendet payload.voltage (Battery-Variante)
    battery_voltage: {
        id: 'voltage',
        prop: 'voltage',
        name: 'Battery voltage',
        icon: undefined,
        role: 'battery.voltage',
        write: false,
        read: true,
        type: 'number',
        def: 0,
        unit: 'V',
    },

    // Fix: prop ergänzt – Z2M sendet payload.energy
    energy: {
        id: 'energy',
        prop: 'energy',
        name: 'Sum of consumed energy',
        icon: undefined,
        role: 'value.power.consumption',
        write: false,
        read: true,
        type: 'number',
        def: 0,
        unit: 'kWh',
    },

    battery: {
        id: 'battery',
        prop: 'battery',
        name: 'Battery percent',
        icon: undefined,
        role: 'value.battery',
        write: false,
        read: true,
        type: 'number',
        def: 0,
        unit: '%',
        min: 0,
        max: 100,
    },

    // Fix: prop ergänzt – Z2M sendet payload.device_temperature
    device_temperature: {
        id: 'device_temperature',
        prop: 'device_temperature',
        name: 'Temperature of the device',
        icon: undefined,
        role: 'value.temperature',
        write: false,
        read: true,
        type: 'number',
        def: 0,
        unit: '°C',
    },

    // Fix: prop ergänzt – Z2M sendet payload.temperature
    temperature: {
        id: 'temperature',
        prop: 'temperature',
        name: 'Temperature',
        icon: undefined,
        role: 'value.temperature',
        write: false,
        read: true,
        type: 'number',
        def: 0,
        unit: '°C',
    },

    humidity: {
        id: 'humidity',
        prop: 'humidity',
        name: 'Humidity',
        icon: undefined,
        role: 'value.humidity',
        write: false,
        read: true,
        type: 'number',
        def: 0,
        unit: '%',
        min: 0,
        max: 100,
    },

    pressure: {
        id: 'pressure',
        prop: 'pressure',
        name: 'Pressure',
        icon: undefined,
        role: 'value.pressure',
        write: false,
        read: true,
        type: 'number',
        def: 0,
        unit: 'hPa',
        min: 0,
        max: 10000,
    },

    illuminance: {
        id: 'illuminance',
        prop: 'illuminance_lux',
        name: 'Illuminance',
        icon: undefined,
        role: 'value.brightness',
        write: false,
        read: true,
        type: 'number',
        def: 0,
        unit: 'lux',
    },

    /**
     * illuminance (Lux-State) – ausgelöst durch payload.illuminance.
     *
     * Fall 1 – beide Werte im Payload (illuminance + illuminance_raw):
     *   payload.illuminance wird direkt übernommen (neues Z2M sendet bereits Lux).
     *
     * Fall 2 – nur illuminance im Payload:
     *   payload.illuminance wird direkt übernommen.
     *
     * Fall 3 – nur illuminance_raw im Payload:
     *   Dieser State wird NICHT von diesem Eintrag gesetzt (prop='illuminance' nicht vorhanden).
     *   Stattdessen übernimmt illuminance_from_raw (prop='illuminance_raw') die Berechnung.
     */
    illuminance_direct: {
        id: 'illuminance',
        prop: 'illuminance',
        name: 'Illuminance',
        icon: undefined,
        role: 'value.brightness',
        write: false,
        read: true,
        type: 'number',
        def: 0,
        unit: 'lux',
    },

    /**
     * illuminance_raw (Rohwert-State) – ausgelöst durch payload.illuminance.
     *
     * Fall 2 – nur illuminance im Payload:
     *   illuminance_raw wird aus dem Lux-Wert zurückgerechnet:
     *   raw = round(log10(lux) * 10000 + 1)
     *
     * Fall 1 – beide Werte im Payload:
     *   Getter gibt undefined zurück → dieser State wird NICHT gesetzt,
     *   stattdessen setzt illuminance_raw_direct (prop='illuminance_raw') den Rohwert direkt.
     */
    illuminance_raw_from_lux: {
        id: 'illuminance_raw',
        prop: 'illuminance',
        name: 'Illuminance raw',
        icon: undefined,
        role: 'value.brightness',
        write: false,
        read: true,
        type: 'number',
        def: 0,
        unit: '',
        getter: (payload) => {
            // Wenn illuminance_raw bereits im Payload → illuminance_raw_direct setzt ihn direkt
            if (payload.illuminance_raw != null) { return undefined; }
            const lux = payload.illuminance;
            if (lux == null) { return undefined; }
            if (lux <= 0) { return 0; }
            return Math.round(Math.log10(lux) * 10000 + 1);
        },
    },

    /**
     * illuminance_raw (Rohwert-State) – ausgelöst durch payload.illuminance_raw.
     *
     * Fall 1 – beide Werte im Payload: direkt übernehmen.
     * Fall 3 – nur illuminance_raw im Payload: direkt übernehmen.
     */
    illuminance_raw_direct: {
        id: 'illuminance_raw',
        prop: 'illuminance_raw',
        name: 'Illuminance raw',
        icon: undefined,
        role: 'value.brightness',
        write: false,
        read: true,
        type: 'number',
        def: 0,
        unit: '',
    },

    /**
     * illuminance (Lux-State) – ausgelöst durch payload.illuminance_raw.
     *
     * Fall 3 – nur illuminance_raw im Payload:
     *   Lux wird berechnet: lux = round(10^((raw - 1) / 10000))
     *
     * Fall 1 – beide Werte im Payload:
     *   Getter gibt undefined zurück → illuminance_direct (prop='illuminance') setzt Lux direkt.
     */
    illuminance_from_raw: {
        id: 'illuminance',
        prop: 'illuminance_raw',
        name: 'Illuminance',
        icon: undefined,
        role: 'value.brightness',
        write: false,
        read: true,
        type: 'number',
        def: 0,
        unit: 'lux',
        getter: (payload) => {
            // Wenn illuminance bereits im Payload → illuminance_direct setzt Lux direkt
            if (payload.illuminance != null) { return undefined; }
            const raw = payload.illuminance_raw;
            if (raw == null) { return undefined; }
            if (raw <= 0) { return 0; }
            return Math.round(Math.pow(10, (raw - 1) / 10000));
        },
    },

    // Fix: prop ergänzt – Z2M sendet payload.occupancy
    occupancy: {
        id: 'occupancy',
        prop: 'occupancy',
        name: 'Occupancy',
        icon: undefined,
        role: 'sensor.motion',
        write: false,
        read: true,
        type: 'boolean',
        def: false,
    },

    contact: {
        id: 'contact',
        prop: 'contact',
        name: 'Contact event',
        icon: undefined,
        role: 'state',
        write: false,
        read: true,
        type: 'boolean',
        def: false,
    },

    opened: {
        id: 'opened',
        prop: 'contact',
        name: 'Is open',
        icon: undefined,
        role: 'sensor.window',
        write: false,
        read: true,
        type: 'boolean',
        def: false,
        // Fix: null-Guard – !undefined wäre true (Tür fälschlich offen)
        getter: (payload) => {
            if (payload.contact == null) { return undefined; }
            return !payload.contact;
        },
    },

    tamper: {
        id: 'tampered',
        prop: 'tamper',
        name: 'Is tampered',
        icon: undefined,
        role: 'state',
        write: false,
        read: true,
        type: 'boolean',
        def: false,
    },

    water_leak: {
        id: 'detected',
        prop: 'water_leak',
        name: 'Water leak detected',
        icon: undefined,
        role: 'indicator.alarm.flood',
        write: false,
        read: true,
        type: 'boolean',
        def: false,
    },

    batt_low_t_f: {
        id: 'battery_low',
        prop: 'battery_low',
        name: 'Battery Status Low',
        icon: undefined,
        role: 'indicator.lowbat',
        write: false,
        read: true,
        type: 'boolean',
        def: false,
    },

    load_power: {
        id: 'load_power',
        prop: 'power',
        name: 'Load power',
        icon: undefined,
        role: 'value.power',
        write: false,
        read: true,
        type: 'number',
        def: 0,
        unit: 'W',
    },

    load_current: {
        id: 'load_current',
        prop: 'current',
        name: 'Load current',
        icon: undefined,
        role: 'value.current',
        write: false,
        read: true,
        type: 'number',
        def: 0,
        unit: 'A',
    },

    temp_calibration: {
        id: 'temperature_calibration',
        prop: 'temperature_calibration',
        name: 'Temperature Calibration Offset',
        icon: undefined,
        role: 'value.temperature',
        write: true,
        read: true,
        type: 'number',
        def: 0,
        unit: '°C',
        isOption: true,
    },

    local_temperature: {
        id: 'local_temperature',
        prop: 'local_temperature',
        name: 'Local Temperature',
        icon: undefined,
        role: 'value.temperature',
        write: false,
        read: true,
        type: 'number',
        def: 0,
        unit: '°C',
    },

    local_temperature_calibration: {
        id: 'local_temperature_calibration',
        prop: 'local_temperature_calibration',
        name: 'Temperature Calibration',
        icon: undefined,
        role: 'level',
        write: true,
        read: true,
        type: 'number',
        def: 0,
        unit: '°C',
    },

    climate_away_mode: {
        id: 'away_mode',
        prop: 'away_mode',
        name: 'Away',
        icon: undefined,
        role: 'state',
        write: true,
        read: true,
        type: 'boolean',
        def: false,
        isEvent: true,
        getter: (payload) => payload.away_mode === 'ON',
        setter: (value) => (value ? 'ON' : 'OFF'),
    },

    // Fix: def ergänzt – ioBroker meldet Fehler beim Anlegen ohne def bei type:'string'
    climate_system_mode: {
        id: 'mode',
        prop: 'system_mode',
        name: 'Mode',
        icon: undefined,
        role: 'state',
        write: true,
        read: true,
        type: 'string',
        def: '',
        states: { auto: 'auto', off: 'off', heat: 'heat' },
    },

    // Fix: write:false – running_state ist ein reiner Sensor-State (Z2M sendet nur, setzt nie)
    // Fix: def ergänzt
    climate_running_mode: {
        id: 'running_state',
        prop: 'running_state',
        name: 'Running Mode',
        icon: undefined,
        role: 'state',
        write: false,
        read: true,
        type: 'string',
        def: '',
        states: { idle: 'idle', heat: 'heat' },
    },

    brightness_step: {
        id: 'brightness_step',
        prop: 'brightness_step',
        name: 'Brightness stepping',
        icon: undefined,
        role: 'state',
        write: true,
        read: false,
        type: 'number',
        def: 0,
        min: -50,
        max: 50,
    },

    hue_move: {
        id: 'hue_move',
        prop: 'hue_move',
        name: 'Hue change',
        icon: undefined,
        role: 'state',
        write: true,
        read: false,
        type: 'number',
        def: 0,
        min: -50,
        max: 50,
    },

    child_lock: {
        id: 'lock',
        prop: 'child_lock',
        name: 'Locked',
        icon: undefined,
        role: 'state',
        write: true,
        read: true,
        type: 'boolean',
        def: false,
        getter: (payload) => payload.child_lock === 'LOCKED',
        setter: (value) => (value ? 'LOCKED' : 'UNLOCKED'),
    },
};

module.exports = {
    states: states,
    unitLookup: unitLookup,
    nameLookup: nameLookup,
};
