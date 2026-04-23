/**
 * Prüft die Zigbee2MQTT-Konfiguration auf veraltete/inkompatible Einstellungen
 * und gibt Fehlermeldungen mit Korrekturhinweisen aus.
 *
 * @param {object} config  Der config-Block aus dem bridge/info-Payload
 * @param {object} log     Das ioBroker-Log-Objekt (this.log)
 * @param {string} version Die Zigbee2MQTT-Versionsnummer (z.B. "1.35.0")
 */
function checkConfig(config, log, version) {
    if (!config || !log) {
        return;
    }

    const advanced     = config.advanced     || {};
    const deviceOptions = config.device_options || {};

    const checkAPIOptions = {
        legacy_api_enabled:                   advanced.legacy_api !== false,
        legacy_availability_payload_enabled:  advanced.legacy_availability_payload !== false,
        device_legacy_enabled:                deviceOptions.legacy !== false,
    };

    const checkAPIOptionsOutput = {
        payload_contains_not_json: advanced.output !== 'attribute_and_json' && advanced.output !== 'json',
    };

    // Fix: version kann undefined/null sein (ältere Z2M-Versionen)
    if (version && version.startsWith('1.')) {
        if (Object.values(checkAPIOptions).filter((x) => x === true).length > 0) {
            log.error('===================================================');
            log.error('===================================================');
            if (checkAPIOptions.legacy_api_enabled === true) {
                log.error('Legacy api is activated, so the adapter can not work correctly!!!');
                log.error('Please add the following lines to your Zigbee2MQTT configuration.yaml:');
                log.error('advanced:');
                log.error(' legacy_api: false');
                log.error('');
            }
            if (checkAPIOptions.legacy_availability_payload_enabled === true) {
                log.error(
                    'Legacy Availability Payload is activated, thus the adapter cannot represent the availability of the devices!!!'
                );
                log.error('Please add the following lines to your Zigbee2MQTT configuration.yaml:');
                log.error('advanced:');
                log.error('legacy_availability_payload: false');
                log.error('');
            }
            if (checkAPIOptions.device_legacy_enabled === true) {
                log.error(
                    'Device Legacy Payload is activated, therefore the adapter may process the states of the devices correctly!!!'
                );
                log.error('Please add the following lines to your Zigbee2MQTT configuration.yaml:');
                log.error('device_options:');
                log.error(' legacy: false');
            }
            log.error('===================================================');
        }
    }
    if (Object.values(checkAPIOptionsOutput).filter((x) => x === true).length > 0) {
        if (checkAPIOptionsOutput.payload_contains_not_json === true) {
            log.error('===================================================');
            log.error(
                'MQTT output type must "attribute_and_json" or "json" , therefore the adapter may process the states of the devices correctly!!!'
            );
            log.error('Please add the following lines to your Zigbee2MQTT configuration.yaml:');
            log.error('advanced:');
            log.error(' output: json');
            log.error('or');
            log.error('advanced:');
            log.error(' output: attribute_and_json');
            log.error('');
            log.error('===================================================');
        }
    }
}

module.exports = {
    checkConfig: checkConfig,
};
