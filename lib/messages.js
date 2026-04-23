/**
 * Gibt die aktuelle Adapter-Konfiguration formatiert als Log-Block aus.
 *
 * @param {object} config Die Adapter-Konfiguration (this.config)
 * @param {object} log    Das ioBroker-Log-Objekt (this.log)
 */
function adapterInfo(config, log) {
    if (!config || !log) {
        return;
    }
    log.info('================================= Adapter Config =================================');
    log.info(`|| Zigbee2MQTT Frontend Scheme: ${config.webUIScheme}`);
    log.info(`|| Zigbee2MQTT Frontend Server: ${config.webUIServer}`);
    log.info(`|| Zigbee2MQTT Frontend Port: ${config.webUIPort}`);
    log.info(`|| Zigbee2MQTT Connection Type: ${config.connectionType}`);
    if (config.connectionType === 'ws') {
        log.info(`|| Zigbee2MQTT Websocket Scheme: ${config.wsScheme}`);
        log.info(`|| Zigbee2MQTT Websocket Server: ${config.wsServerIP}`);
        log.info(`|| Zigbee2MQTT Websocket Port: ${config.wsServerPort}`);
        log.info(`|| Zigbee2MQTT Websocket Auth-Token: ${config.wsTokenEnabled ? 'use' : 'unused'}`);
        log.info(`|| Zigbee2MQTT Websocket Dummy MQTT-Server: ${config.dummyMqtt ? 'activated' : 'deactivated'}`);
        if (config.dummyMqtt === true) {
            log.info(`|| Zigbee2MQTT Dummy MQTT IP-Bind: ${config.mqttServerIPBind}`);
            log.info(`|| Zigbee2MQTT Dummy MQTT Port: ${config.mqttServerPort}`);
        }
    } else if (config.connectionType === 'exmqtt') {
        log.info(`|| Zigbee2MQTT External MQTT Server: ${config.externalMqttServerIP}`);
        log.info(`|| Zigbee2MQTT External MQTT Port: ${config.externalMqttServerPort}`);
        log.info(
            `|| Zigbee2MQTT External MQTT Credentials: ${config.externalMqttServerCredentials ? 'use' : 'unused'}`
        );
    } else if (config.connectionType === 'intmqtt') {
        log.info(`|| Zigbee2MQTT Internal MQTT IP-Bind: ${config.mqttServerIPBind}`);
        log.info(`|| Zigbee2MQTT Internal MQTT Port: ${config.mqttServerPort}`);
    }
    log.info(`|| Zigbee2MQTT Debug Log: ${config.debugLogEnabled ? 'activated' : 'deactivated'}`);
    log.info(`|| Proxy Zigbee2MQTT Logs to ioBroker Logs: ${config.proxyZ2MLogs ? 'activated' : 'deactivated'}`);
    log.info(`|| Use Kelvin: ${config.useKelvin ? 'yes' : 'no'}`);
    log.info(`|| Use ColorTemperature ColorSync: ${config.colorTempSyncColor ? 'yes' : 'no'}`);
    log.info(`|| Use BrightnessMove OnOff: ${config.brightnessMoveOnOff ? 'yes' : 'no'}`);
    log.info(`|| Use BrightnessStep OnOff: ${config.brightnessStepOnOff ? 'yes' : 'no'}`);
    log.info(`|| Use Event In Desc: ${config.useEventInDesc ? 'yes' : 'no'}`);
    log.info(`|| Use Device Icons: ${config.useDeviceIcons ? 'yes' : 'no'}`);
    log.info(`|| Use Simple Hold/Release State: ${config.simpleHoldReleaseState ? 'yes' : 'no'}`);
    log.info(`|| Use Simple Move/Stop State: ${config.simpleMoveStopState ? 'yes' : 'no'}`);
    log.info(`|| Use Simple Press/Release State: ${config.simplePressReleaseState ? 'yes' : 'no'}`);
    log.info(`|| Use Automatic Coordinator Check: ${config.coordinatorCheck ? 'yes' : 'no'}`);
    log.info(`|| Coordinator Check Loglevel: ${config.coordinatorCheckLogLvl}`);
    log.info(`|| Coordinator Check Cron : ${config.coordinatorCheckCron}`);
    log.info('==================================================================================');
}

/**
 * Gibt die Zigbee2MQTT-Bridge-Informationen formatiert als Log-Block aus.
 *
 * @param {object} payload Der Payload des bridge/info-Topics
 * @param {object} log     Das ioBroker-Log-Objekt (this.log)
 */
function zigbee2mqttInfo(payload, log) {
    if (!payload || !log) {
        return;
    }
    log.info('============================ Zigbee2MQTT Information =============================');
    log.info(`|| Zigbee2MQTT Version: ${payload.version} `);
    const coordType     = payload.coordinator && payload.coordinator.type ? payload.coordinator.type : 'unknown';
    const coordRev      = payload.coordinator && payload.coordinator.meta ? payload.coordinator.meta.revision : 'unknown';
    const serialPort    = payload.config && payload.config.serial ? payload.config.serial.port : 'unknown';
    const panId         = payload.network ? payload.network.pan_id : 'unknown';
    const channel       = payload.network ? payload.network.channel : 'unknown';
    const extPanId      = payload.network ? payload.network.extended_pan_id : 'unknown';
    log.info(`|| Coordinator type: ${coordType} Version: ${coordRev} Serial: ${serialPort}`);
    log.info(`|| Network panid ${panId} channel: ${channel} ext_pan_id: ${extPanId}`);
    log.info('==================================================================================');
}

module.exports = {
    adapterInfo,
    zigbee2mqttInfo,
};
