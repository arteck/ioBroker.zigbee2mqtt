<img src="admin/zigbee2mqtt.png" width="200" />

# ioBroker.zigbee2mqtt

[![NPM version](https://img.shields.io/npm/v/iobroker.zigbee2mqtt.svg)](https://www.npmjs.com/package/iobroker.zigbee2mqtt)
[![Downloads](https://img.shields.io/npm/dm/iobroker.zigbee2mqtt.svg)](https://www.npmjs.com/package/iobroker.zigbee2mqtt)
![Number of Installations](https://iobroker.live/badges/zigbee2mqtt-installed.svg)
![Current version in stable repository](https://iobroker.live/badges/zigbee2mqtt-stable.svg)

[![NPM](https://nodei.co/npm/iobroker.zigbee2mqtt.png?downloads=true)](https://nodei.co/npm/iobroker.zigbee2mqtt/)

**Tests:** ![Test and Release](https://github.com/o0shojo0o/ioBroker.zigbee2mqtt/workflows/Test%20and%20Release/badge.svg)

## zigbee2mqtt adapter for ioBroker

This adapter allows to control the data points of the devices of a Zigbee2MQTT instance in ioBroker.  

## Adapter Documentation

[Adapter Documentation](./docs/wiki.md)

## Changelog

<!--
 https://github.com/AlCalzone/release-script#usage
    npm run release major -- -p iobroker license --all 0.9.8 -> 1.0.0
    npm run release minor -- -p iobroker license --all 0.9.8 -> 0.10.0
    npm run release patch -- -p iobroker license --all 0.9.8 -> 0.9.9
    npm run release prerelease beta -- -p iobroker license --all v0.2.1 -> v0.2.2-beta.0
	Placeholder for the next version (at the beginning of the line):
	### **WORK IN PROGRESS**
-->
### **WORK IN PROGRESS**

-   (o0shojo0o) added option `Brightness move should also turn the light on or off`
-   (o0shojo0o) added state toggle for groups 
-   (o0shojo0o) more dynamic during data point creation ([#48](https://github.com/o0shojo0o/ioBroker.zigbee2mqtt/issues/48)).

### 2.3.0 (2022-10-30)

-   (o0shojo0o) added support for the `toggle` of states that support this.
-   (o0shojo0o) added correct handling of `color_move` and `color_temperature_move`

### 2.2.1 (2022-10-25)

-   (o0shojo0o) fix state roles and access
-   (o0shojo0o) fix state handling
-   (o0shojo0o) fix createZ2MMessage

### 2.2.0 (2022-10-20)

-   (o0shojo0o) added support for [Lidl HG06467 effects](https://www.zigbee2mqtt.io/devices/HG06467.html#trigger-effects)
-   (o0shojo0o) added support for hs color
-   (o0shojo0o) `simulated_brightness` data point is added only for supported devices

### 2.1.1 (2022-10-16)

-   (o0shojo0o) advanced detection if a device has been removed
-   (o0shojo0o) fixes the design error in the websocket connection

### 2.1.0 (2022-10-14)

-   (o0shojo0o) added option for color temperature sync with color
-   (o0shojo0o) fix logfilter and debugDevices
-   (o0shojo0o) lots of bugfixes
-   (o0shojo0o) now set the correct min/max at color temp
-   (o0shojo0o) better error handling for the connections

### 2.0.0 (2022-10-12)

**!!!BREAKING CHANGE!!!**

-   (o0shojo0o) added configurable connection to Zigbee2MQTT (Settings must be renewed)
    -   Websocket
    -   External MQTT-Server
    -   Internal MQTT-Server
-   (o0shojo0o) optimized state writing performance in ioBroker
-   (o0shojo0o) fixed the correct set of the connection status

### 1.0.0 (2022-10-09)

**!!!BREAKING CHANGE!!!**

-   (o0shojo0o) added options for external MQTT-Server
-   (o0shojo0o) connection to zigbee2mqtt completely reworked and changed to MQTT
-   (o0shojo0o) lots of bugfixes
-   (o0shojo0o) automatically set button actions back to false
-   (o0shojo0o) added support for Zigbee2MQTT feature simulated_brightness
-   (o0shojo0o) added config check
-   (arteck) added log output about coordinator details

### 0.2.0 (2022-10-04)

-   (o0shojo0o) group states corrected
-   (o0shojo0o) added option 'Use Kelvin instead of mired for the color temps'
-   (o0shojo0o) remove available logic, now will use the information from z2m
-   (o0shojo0o) rename noLogDevices to logfilter
-   (o0shojo0o) lots of bugfixes
-   (arteck) added noLogDevices functionality
-   (arteck) added debugmessage for specific device functionality
-   (arteck) added some states are default false
-   (o0shojo0o) added support for scenes defined on a device
-   (o0shojo0o) fix available state role
-   (o0shojo0o) fix subscribeWritableStates

### 0.1.0 (2022-09-29)

-   (o0shojo0o) first release

## License

MIT License

Copyright (c) 2022 Dennis Rathjen <dennis.rathjen@outlook.de>

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
