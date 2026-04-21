/**
 * Converts a bulb level of range [0...254] to an adapter level of range [0...100]
 *
 * @param bulbLevel
 */
function bulbLevelToAdapterLevel(bulbLevel) {
    if (bulbLevel >= 2) {
        // Perform linear mapping of range [2...254] to [1...100]
        return Math.round(((bulbLevel - 2) * 99) / 252) + 1;
    }
    // The bulb is considered off. Even a bulb level of "1" is considered as off.
    return 0;
}

/**
 * Converts an adapter level of range [0...100] to a bulb level of range [0...254]
 *
 * @param adapterLevel
 */
function adapterLevelToBulbLevel(adapterLevel) {
    if (adapterLevel != null && adapterLevel > 0) {
        // Perform linear mapping of range [1...100] to [2...254]
        return Math.round(((adapterLevel - 1) * 252) / 99) + 2;
    }
    // Switch the bulb off. Some bulbs need "0" (IKEA), others "1" (HUE), and according to the
    // ZigBee docs "1" is the "minimum possible level"... we choose "0" here which seems to work.
    return 0;
}


// If the value is greater than 1000, kelvin is assumed.
// If smaller, it is assumed to be mired.
/**
 *
 * @param t
 */
function toMired(t) {
    let miredValue = t;
    if (t > 1000) {
        miredValue = miredKelvinConversion(t);
    }
    return miredValue;
}

/**
 *
 * @param t
 */
function miredKelvinConversion(t) {
    return Math.round(1000000 / t);
}

/**
 * Converts a decimal number to a hex string with zero-padding
 *
 * @param decimal
 * @param padding
 */
function decimalToHex(decimal, padding) {
    let hex = Number(decimal).toString(16);
    padding = typeof padding === 'undefined' || padding === null ? 2 : padding;

    while (hex.length < padding) {
        hex = `0${hex}`;
    }

    return hex;
}


/**
 *
 * @param array
 */
function clearArray(array) {
    while (array.length > 0) {
        array.pop();
    }
}

/**
 *
 * @param source
 * @param target
 */
function moveArray(source, target) {
    while (source.length > 0) {
        target.push(source.shift());
    }
}

/**
 *
 * @param item
 */
function isObject(item) {
    return typeof item === 'object' && !Array.isArray(item) && item !== null;
}


module.exports = {
    bulbLevelToAdapterLevel,
    adapterLevelToBulbLevel,
    toMired,
    miredKelvinConversion,
    decimalToHex,
    clearArray,
    moveArray,
    isObject,
};
