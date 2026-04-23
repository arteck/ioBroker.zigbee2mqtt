/**
 * Konvertiert einen Lampen-Helligkeitswert [0..254] in einen Adapter-Prozentwert [0..100].
 *
 * @param {number} bulbLevel Helligkeitswert der Lampe (0–254)
 * @returns {number}         Prozentwert (0–100)
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
 * Konvertiert einen Adapter-Prozentwert [0..100] in einen Lampen-Helligkeitswert [0..254].
 *
 * @param {number} adapterLevel Prozentwert (0–100)
 * @returns {number}            Helligkeitswert der Lampe (0–254)
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
 * Konvertiert einen Kelvin- oder Mired-Wert immer in Mired.
 * Werte > 1000 werden als Kelvin interpretiert und umgerechnet.
 *
 * @param {number} t Farbtemperatur in Kelvin (>1000) oder Mired (≤1000)
 * @returns {number} Farbtemperatur in Mired
 */
function toMired(t) {
    let miredValue = t;
    if (t > 1000) {
        miredValue = miredKelvinConversion(t);
    }
    return miredValue;
}

/**
 * Konvertiert zwischen Mired und Kelvin (die Formel ist in beide Richtungen gleich: 1.000.000 / t).
 *
 * @param {number} t Farbtemperatur in Mired oder Kelvin
 * @returns {number} Umgerechneter Wert (gerundet)
 */
function miredKelvinConversion(t) {
    return Math.round(1000000 / t);
}

/**
 * Konvertiert eine Dezimalzahl in einen hex-String mit führenden Nullen.
 *
 * @param {number} decimal  Die umzuwandelnde Zahl
 * @param {number} [padding] Mindestlänge des hex-Strings (wird mit '0' aufgefüllt)
 * @returns {string}        Hex-String in Kleinbuchstaben
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
 * Leert ein Array in-place (O(1)).
 *
 * @param {Array} array Das zu leerende Array
 */
function clearArray(array) {
    array.length = 0;
}

/**
 * Verschiebt alle Einträge von source nach target und leert source dabei.
 *
 * @param {Array} source Quell-Array (wird nach dem Aufruf leer sein)
 * @param {Array} target Ziel-Array (bekommt alle Einträge aus source angehängt)
 */
function moveArray(source, target) {
    target.push(...source);
    source.length = 0;
}

/**
 * Prüft ob ein Wert ein einfaches Objekt ist (kein Array, kein null).
 *
 * @param {*} item Der zu prüfende Wert
 * @returns {boolean} true wenn item ein Objekt ist, sonst false
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
