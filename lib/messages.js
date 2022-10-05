async function adapterInfo(config, log) {
	log.info(`Zigbee2MQTT Frontend Server: ${config.server}`);
	log.info(`Zigbee2MQTT Frontend Port: ${config.port}`);
	log.info(`Zigbee2MQTT Debug Log: ${config.debugLogEnabled ? 'activated' : 'deactivated'}`);
	log.info(`Proxy Zigbee2MQTT Logs to ioBroker Logs: ${config.proxyZ2MLogs ? 'activated' : 'deactivated'}`);
	log.info(`Use Kelvin: ${config.useKelvin ? 'yes' : 'no'}`);
}

async function zigbee2mqttInfo(payload, log) {
	log.info(`Zigbee2MQTT Version: ${payload.version} `);
	log.info(`Coordinator type: ${payload.coordinator.type} Version: ${payload.coordinator.meta.revision} Serial: ${payload.config.serial.port}`);
	log.info(`Network panid ${payload.network.pan_id} channel: ${payload.network.channel} ext_pan_id: ${payload.network.extended_pan_id}`);
}

module.exports = {
	adapterInfo: adapterInfo,
	zigbee2mqttInfo: zigbee2mqttInfo,
};