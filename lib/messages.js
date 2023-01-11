async function adapterInfo(config, log) {
    log.info('================================= Adapter Config =================================');
    log.info(`|| Zigbee2MQTT Frontend Scheme: ${config.webUIScheme}`);
    log.info(`|| Zigbee2MQTT Frontend Server: ${config.webUIServer}`);
    log.info(`|| Zigbee2MQTT Frontend Port: ${config.webUIPort}`);
    log.info(`|| Zigbee2MQTT Connection Type: ${config.connectionType}`);
    if (config.connectionType == 'ws') {
        log.info(`|| Zigbee2MQTT Websocket Server: ${config.wsServerIP}`);
        log.info(`|| Zigbee2MQTT Websocket Port: ${config.wsServerPort}`);
        log.info(`|| Zigbee2MQTT Websocket Auth-Token: ${config.wsTokenEnabled ? 'use' : 'unused'}`);
        log.info(`|| Zigbee2MQTT Websocket Dummy MQTT-Server: ${config.dummyMqtt ? 'activated' : 'deactivated'}`);
        if (config.dummyMqtt == true) {
            log.info(`|| Zigbee2MQTT Dummy MQTT IP-Bind: ${config.mqttServerIPBind}`);
            log.info(`|| Zigbee2MQTT Dummy MQTT Port: ${config.mqttServerPort}`);
        }
    } else if (config.connectionType == 'exmqtt') {
        log.info(`|| Zigbee2MQTT Externanl MQTT Server: ${config.externalMqttServerIP}`);
        log.info(`|| Zigbee2MQTT Externanl MQTT Port: ${config.externalMqttServerPort}`);
    } else if (config.connectionType == 'intmqtt') {
        log.info(`|| Zigbee2MQTT Internal MQTT IP-Bind: ${config.mqttServerIPBind}`);
        log.info(`|| Zigbee2MQTT Internal MQTT Port: ${config.mqttServerPort}`);
    }
    log.info(`|| Zigbee2MQTT Debug Log: ${config.debugLogEnabled ? 'activated' : 'deactivated'}`);
    log.info(`|| Proxy Zigbee2MQTT Logs to ioBroker Logs: ${config.proxyZ2MLogs ? 'activated' : 'deactivated'}`);
    log.info(`|| Use Kelvin: ${config.useKelvin ? 'yes' : 'no'}`);
    log.info('==================================================================================');
}

async function zigbee2mqttInfo(payload, log) {
    log.info('============================ Zigbee2MQTT Information =============================');
    log.info(`|| Zigbee2MQTT Version: ${payload.version} `);
    log.info(`|| Coordinator type: ${payload.coordinator.type} Version: ${payload.coordinator.meta.revision} Serial: ${payload.config.serial.port}`);
    log.info(`|| Network panid ${payload.network.pan_id} channel: ${payload.network.channel} ext_pan_id: ${payload.network.extended_pan_id}`);
    log.info('==================================================================================');
}

module.exports = {
    adapterInfo,
    zigbee2mqttInfo,
};