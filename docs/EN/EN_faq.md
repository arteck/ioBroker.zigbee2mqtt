# FAQ

Here the most frequently asked questions are answered. Basically the official documentation of Zigbee2MQTT can be consulted. 
This WIKI primarily clarifies questions about the handling of the adapter and not with the Zigbee2MQTT itself.

Official Documentation: https://www.zigbee2mqtt.io/guide/getting-started

# Table of contents 
- [Connection/configuration page to Zigbee2MQTT is not displayed in ioBroker](#1)
- [How do I get the exposes from a device?](#4)
- [Which Zigbee2Mqtt configuration parameters are needed?](#5)


## Connection/configuration page to Zigbee2MQTT is not displayed in ioBroker <a name="1"></a>
Initial situation:

If one uses an encrypted connection over HTTPS in the ioBroker Admin, the browser does not load the embedded Zigbee2MQTT UI.

Cause:

Unfortunately, an encrypted connection cannot (yet) be configured in Zigbee2MQTT. By using the HTTPS connection of the Admin Adapter unfortunately no unencrypted iFrame connection can be used, which is the case here.

Solution:
-  disable the HTTPS connection in the Admin Adapter.
-  proxy connection for the configuration page of Zigbee2MQTT, but it is not yet clear whether the websocket connection used by this adapter will still work.

## How do I get the exposes from a device? <a name="4"></a>

- You must enter the IEEE address (`0x......`) from the affected device into the datapoint `zigbee2mqtt.[X].info.debugmessages`
- Then restart the adapter
- And now look for the warning message in the log, which starts like this: `-->> fromZ2M -> 0x...... exposes:`

## Which Zigbee2MQTT configuration parameters are needed? <a name="5"></a>

This adapter is based on the current JSON payload of Zigbee2MQTT, so the legacy mode is not supported.  
This means that the following config parameters are **mandatory** for the adapter to work properly!

```yaml
advanced:
    <Your other parameters>
    legacy_api: false
    legacy_availability_payload: false
    output: json
device_options:
    legacy: false
availability: true
```
