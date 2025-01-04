function checkConfig(config, log, version) {
    const checkAPIOptions = {
        legacy_api_enabled: config.advanced.legacy_api != false,
        legacy_availability_payload_enabled: config.advanced.legacy_availability_payload != false,
        device_legacy_enabled: config.device_options.legacy != false
    };

    const checkAPIOptionsOutput = {
        payload_contains_not_json: config.advanced.output != 'attribute_and_json' && config.advanced.output != 'json'
    };

    if (version.startsWith('1.')) {      // wird in version 2.x immer auf false gesetzt sein
        if (Object.values(checkAPIOptions).filter((x) => x == true).length > 0) {
            log.error('===================================================');
            log.error('===================================================');
            if (checkAPIOptions.legacy_api_enabled == true) {
                log.error('Legacy api is activated, so the adapter can not work correctly!!!');
                log.error('Please add the following lines to your Zigbee2MQTT configuration.yaml:');
                log.error('advanced:');
                log.error(' legacy_api: false');
                log.error('');
            }
            if (checkAPIOptions.legacy_availability_payload_enabled == true) {
                log.error(
                    'Legacy Availability Payload is activated, thus the adapter cannot represent the availability of the devices!!!'
                );
                log.error('Please add the following lines to your Zigbee2MQTT configuration.yaml:');
                log.error('advanced:');
                log.error('legacy_availability_payload: false');
                log.error('');
            }
            if (checkAPIOptions.device_legacy_enabled == true) {
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
    if (Object.values(checkAPIOptionsOutput).filter((x) => x == true).length > 0) {
        if (checkAPIOptions.payload_contains_not_json == true ) {
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
