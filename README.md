<img src="admin/zigbee2mqtt.png" width="200" />

# ioBroker.zigbee2mqtt

[![NPM version](https://img.shields.io/npm/v/iobroker.zigbee2mqtt.svg)](https://www.npmjs.com/package/iobroker.zigbee2mqtt)
[![Downloads](https://img.shields.io/npm/dm/iobroker.zigbee2mqtt.svg)](https://www.npmjs.com/package/iobroker.zigbee2mqtt)
![Number of Installations](https://iobroker.live/badges/zigbee2mqtt-installed.svg)
![Current version in stable repository](https://iobroker.live/badges/zigbee2mqtt-stable.svg)

[![NPM](https://nodei.co/npm/iobroker.zigbee2mqtt.png?downloads=true)](https://nodei.co/npm/iobroker.zigbee2mqtt/)

**Tests:**  
![Test and Release](https://github.com/arteck/ioBroker.zigbee2mqtt/workflows/Test%20and%20Release/badge.svg)
![CodeQL](https://github.com/arteck/ioBroker.zigbee2mqtt/actions/workflows/codeql.yml/badge.svg?branch=main)

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
### 2.13.4 (2023-12-17)

-   (arteck) fixed unnecessary warning for special value ([269](https://github.com/arteck/ioBroker.zigbee2mqtt/issues/269))

### 2.13.3 (2023-10-10)

-   (arteck) fixed devices erroneous offline indication ([#255](https://github.com/arteck/ioBroker.zigbee2mqtt/issues/255))

### 2.13.2 (2023-09-30)

-   (arteck) fixed NULL values when HASS integration is enabled in zigbee2mqtt

### 2.13.1 (2023-09-07)

-   (arteck) fixed storage name

### 2.13.0 (2023-09-07)

-   (arteck) added state `info.coordinator_check` ([#247](https://github.com/arteck/ioBroker.zigbee2mqtt/issues/247))
-   (arteck) added state `info.missing_routers` ([#247](https://github.com/arteck/ioBroker.zigbee2mqtt/issues/247))
-   (arteck) added state `info.missing_routers_count` ([#247](https://github.com/arteck/ioBroker.zigbee2mqtt/issues/247))
-   (arteck) added option `Automatic check for missing routers in the coordinator memory` ([#247](https://github.com/arteck/ioBroker.zigbee2mqtt/issues/247))

### 2.12.0 (2023-09-05)

-   (arteck) added option `Size of the object icons in pixels`

### 2.11.0 (2023-08-24)

-   (arteck) added automatic download of device image from zigbee2mqtt to meta-storage
-   (arteck) device images from Meta-Storage added to the object 
-   (arteck) device images from Meta-Storage auto resize to 28x28 pixel for smaller object
-   (arteck) added option `Download device images from Zigbee2Mqtt and use them as object icons.`
-   (arteck) fixed Hue_Move ([#223](https://github.com/arteck/ioBroker.zigbee2mqtt/issues/223))
-   (arteck) added option `Generate simple 'Hold' and 'Release' states`
-   (arteck) added option `Generate simple 'Move' and 'Stop' states`
-   (arteck) added option `Generate simple 'Press' and 'Release' states`

### 2.10.1 (2023-08-13)

-   (arteck) fixed type definitions (thx @arteck)

### 2.10.0 (2023-08-12)

-   (arteck) optimisation for the MQTT connection  
-   (arteck) fixed for MQTT output type: attribute_and_json ([#87](https://github.com/arteck/ioBroker.zigbee2mqtt/issues/87))
-   (arteck) added support for external MQTT-Server credentials ([#148](https://github.com/arteck/ioBroker.zigbee2mqtt/issues/148))
  	- *After update, Websocket Auth-Token must be set again, if used.*

### 2.9.0 (2023-07-21)

-   (arteck) added state `send_payload` to send a raw json payload

### 2.8.0 (2023-07-19)

-   (arteck) added WSS support for websoket connection ([#191](https://github.com/arteck/ioBroker.zigbee2mqtt/issues/191))
-   (arteck) small fixes

### 2.7.5 (2023-04-08)

-   (arteck) added state `last_seen` contains date/time of last Zigbee message ([#131](https://github.com/arteck/ioBroker.zigbee2mqtt/issues/131))

### 2.7.4 (2023-03-05)

-   (arteck) fixed for Aqara presence detector FP1 `reset_nopresence_status`

### 2.7.3 (2023-02-18)

-   (arteck) hotfix for Aqara presence detector FP1

### 2.7.2 (2023-02-01)

-   (arteck) rework of the detection of removed devices

### 2.7.1 (2023-01-24)

-   (arteck) added option for use folder description
-   (arteck) use the iobroker device folder description for device description or events

### 2.7.0 (2023-01-18)

-   (arteck) added support for  wildcard actions (eg. *_single) ([#116](https://github.com/arteck/ioBroker.zigbee2mqtt/issues/116))
-   (arteck) added error handling optimizations ([more](https://github.com/ioBroker/ioBroker.repositories/pull/1976#issuecomment-1382038679))
-   (arteck) added option `auth_token` for websocket connection ([#112](https://github.com/arteck/ioBroker.zigbee2mqtt/issues/112))
-   (arteck) websocket timeout increased

### 2.6.0 (2023-01-10)

-   (arteck) added state `transition` for transition overwrite (-1 disabled overwrite) ([#101](https://github.com/arteck/ioBroker.zigbee2mqtt/issues/101))
-   (arteck) consideration of the description when creating the friendly name ([#105](https://github.com/arteck/ioBroker.zigbee2mqtt/issues/105))
-   (arteck) added state `effect` for groups ([#101](https://github.com/arteck/ioBroker.zigbee2mqtt/issues/101))
-   (arteck) fixed state contact
-   (arteck) added handling for disabled devices

### 2.5.0 (2023-01-02)

-   (arteck) added option `Brightness step should also turn the light on or off`
-   (arteck) added handling of `brightness_step` ([#96](https://github.com/arteck/ioBroker.zigbee2mqtt/issues/96))
-   (arteck) states processing more flexible designed ([#94](https://github.com/arteck/ioBroker.zigbee2mqtt/issues/94))

### 2.4.5 (2022-12-20)

-   (arteck) extend `text` for `action` ([#84](https://github.com/arteck/ioBroker.zigbee2mqtt/issues/84))

### 2.4.4 (2022-12-06)

-   (arteck) better state identification ([#79](https://github.com/arteck/ioBroker.zigbee2mqtt/issues/79))

### 2.4.3 (2022-11-23)

-   (arteck) fixed availability when `friendly_name` `/` contains

### 2.4.2 (2022-11-20)

-   (arteck) added correct handling of `move_to_saturation`, `hue_move` and `brightness_move_to_level` ([#68](https://github.com/arteck/ioBroker.zigbee2mqtt/issues/68))
-   (arteck) fixed when `friendly_name` `/` contains

### 2.4.1 (2022-11-16)

-   (arteck) fixed based on [review](https://github.com/ioBroker/ioBroker.repositories/pull/1976#issuecomment-1316656378)

### 2.4.0 (2022-11-08)

-   (arteck) fixed for devices with multiple endpoints ([#57](https://github.com/arteck/ioBroker.zigbee2mqtt/issues/57)).
-   (arteck) added option `Brightness move should also turn the light on or off`
-   (arteck) added state toggle for groups 
-   (arteck) more dynamic during data point creation ([#48](https://github.com/arteck/ioBroker.zigbee2mqtt/issues/48)).

### 2.3.0 (2022-10-30)

-   (arteck) added support for the `toggle` of states that support this.
-   (arteck) added correct handling of `color_move` and `color_temperature_move`

### 2.2.1 (2022-10-25)

-   (arteck) fixed state roles and access
-   (arteck) fixed state handling
-   (arteck) fixed createZ2MMessage

### 2.2.0 (2022-10-20)

-   (arteck) added support for [Lidl HG06467 effects](https://www.zigbee2mqtt.io/devices/HG06467.html#trigger-effects)
-   (arteck) added support for hs color
-   (arteck) `simulated_brightness` data point is added only for supported devices

### 2.1.1 (2022-10-16)

-   (arteck) advanced detection if a device has been removed
-   (arteck) fixes the design error in the websocket connection

### 2.1.0 (2022-10-14)

-   (arteck) added option for color temperature sync with color
-   (arteck) fixed logfilter and debugDevices
-   (arteck) lots of bugfixes
-   (arteck) now set the correct min/max at color temp
-   (arteck) better error handling for the connections

### 2.0.0 (2022-10-12)

**!!!BREAKING CHANGE!!!**

-   (arteck) added configurable connection to Zigbee2MQTT (Settings must be renewed)
    -   Websocket
    -   External MQTT-Server
    -   Internal MQTT-Server
-   (arteck) optimized state writing performance in ioBroker
-   (arteck) fixed the correct set of the connection status

### 1.0.0 (2022-10-09)

**!!!BREAKING CHANGE!!!**

-   (arteck) added options for external MQTT-Server
-   (arteck) connection to zigbee2mqtt completely reworked and changed to MQTT
-   (arteck) lots of bugfixes
-   (arteck) automatically set button actions back to false
-   (arteck) added support for Zigbee2MQTT feature simulated_brightness
-   (arteck) added config check
-   (arteck) added log output about coordinator details

### 0.2.0 (2022-10-04)

-   (arteck) group states corrected
-   (arteck) added option 'Use Kelvin instead of mired for the color temps'
-   (arteck) remove available logic, now will use the information from z2m
-   (arteck) rename noLogDevices to logfilter
-   (arteck) lots of bugfixes
-   (arteck) added noLogDevices functionality
-   (arteck) added debugmessage for specific device functionality
-   (arteck) added some states are default false
-   (arteck) added support for scenes defined on a device
-   (arteck) fixed available state role
-   (arteck) fixed edsubscribeWritableStates

### 0.1.0 (2022-09-29)

-   (arteck) first release

## License

MIT License

Copyright (c) 2024 Arthur Rupp <arteck@outlook.com>,

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
