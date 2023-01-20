### Configuration of the adapter
| Option | Value |
|--|--|
| Select Zigbee2MQTT connection |Recommended setting "Websocket" |
| Websocket IP address |IP or DNS name of the Zigbee2MQTT server (in our case the IP of the Docker host)|
|Websocket Port | 8080 Is the default port, if it is changed in the config of Zigbee2MQTT it has to be changed here too.
|Use Auth-Token|Enable to store an Auth-Token/Password to the configuration page. !!! ATTENTION !!! Special characters are not supported. More info at [Zigbee2MQTT](https://www.zigbee2mqtt.io/guide/configuration/frontend.html#advanced-configuration)|
|Create dummy MQTT server for Zigbee2MQTT | Since we need a MQTT server for Zigbee2MQTT we can set this checkmark then we have the possibility to create such a server here in the adapter.
|Bind MQTT server IP address/MQTT server port | these settings only appear if we have set the checkmark for the dummy MQTT server. If there is no other MQTT server on the ioBroker, we can leave the default settings as they are, otherwise we have to change at least the port. These settings should then also be stored in the config of Zigbee2MQTT.
|Configuration of Zigbee2MQTT Web UI Connection Configuration|Here we can configure how the Zigbee2MQTT Web UI should be connected to the ioBroker. It is important to note: If the ioBroker is called via HTTPS, a connection via HTTPS must also be established here. Otherwise the following error will occur: (https://github.com/o0shojo0o/ioBroker.zigbee2mqtt/issues/12)
|Synchronize color temperature with color | This setting ensures that e.g. in a VIS like Lovelace the color of the lamp changes to the set color.
|Use Kelvin values instead of Mired | Set the unit for color temperatures for e.g. lamps.
|Brightness move should also turn the light on or off| When activated, when the brightness via Brightness move has reached 0, the lamp will be turned off. And when the lamp is off, it is also switched on again.
|Brightness step should also switch the light on or off| When activated, when the brightness via Brightness step has reached 0, the lamp will be turned off. And when the lamp is off, it is also switched on again.
|Proxy Zigbee2MQTT logs to ioBroker logs |Takes the logs from Zigbee2MQTT to the ioBroker log
  

![Zigbee2MQTT configuration](../img/Zigbee2MQTT_Adapter.png)
