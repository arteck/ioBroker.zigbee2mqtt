#!/bin/bash

set -e

# Load environment variables from .env file if it exists
if [ -f .env ]; then
    export $(grep -v '^#' .env | xargs)
fi

iob object set system.adapter.zigbee2mqtt.0 native.wsServerIP=zigbee2mqtt
iob object set system.adapter.zigbee2mqtt.0 native.webUIServer=zigbee2mqtt
