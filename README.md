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

[Adapter Documentation](https://github.com/arteck/ioBroker.zigbee2mqtt/blob/main/docs/wiki.md)

## Changelog
### 3.1.7 (2026-04-24)
* (arteck) fix illuminance = 0

### 3.1.5 (2026-04-23)
* (arteck) fix illuminance

### 3.1.4 (2026-04-23)
* (arteck) fix illuminance if not exists. we calculate it ourselves

### 3.1.3 (2026-04-23)
* (arteck) fix illuminance_raw 
* (arteck) fix illuminance
* (arteck) fix action state

## License

MIT License

Copyright (c) 2025-2026 Arthur Rupp <arteck@outlook.com>,

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
