# Devcontainer readme
This directory allows you to develop your adapter in a dedicated Docker container. To get started and for requirements, please read the getting started section at https://code.visualstudio.com/docs/remote/containers#_getting-started

Once you're done with that, VSCode will prompt you to reopen the adapter directory in a container.

## Setup
This Dev Container consists of 4 containers:
- iobroker: The ioBroker instance with the zigbee2mqtt adapter
- zigbee2mqtt: The Zigbee2MQTT instance
- mqtt: The MQTT instance for Zigbee2MQTT
- nginx: The NGINX instance to access ioBroker

## Configuration Zigbee Stick
1) If the stick is attached by usb, map it in [docker-compose.yml](docker-compose.yml) in `iobroker-zigbee2mqtt` service
2) Configure the stick in Zigbee2MQTT [configuration.yaml](zigbee2mqtt/configuration.yaml) in `serial` section