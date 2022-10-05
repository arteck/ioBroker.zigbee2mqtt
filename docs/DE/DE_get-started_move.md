
# Installation inkl. Umzug vom ioBroker/Zigbee Adapter

Die Installation des Adapter erfordert einige vorarbeiten. 
Hier wird die Grundlegende Installation aller voraussetzungen, detalierte Infos, Anleitungen und Einstellungen findet ihr auf der Seite von Zigbee2MQTT.



## Installation

In unserem Beispiel wird Zigbee2MQTT via Docker / Docker Compose eingerichtet. Weitere Einrichtugsmethoden findet ihr auf der offizellen Dokumenation.
Als vorraussetzung ist hier ein eingerichter Docker Server geben!

1. Vorhanden oder neue Docker-Compose.yml bearbeiten und um folgenden Eintrag ergänzen.
    Wichtig ist nur das diese Einstellungen an eure Umgebung angepasst werden, z.B. der Pfad zur USB Antenne unter "devices" oder der Pfad zur Konfig Datei unter "volumes".

    ```yml
    zigbee2mqtt:
        container_name: zigbee2mqtt
        restart: unless-stopped
        image: koenkk/zigbee2mqtt
        ports:
        - 8080:8080
        devices:
        - /dev/ttyUSB0:/dev/ttyUSB0
        volumes:
        - /etc/localtime:/etc/localtime:ro
        - ./zigbee2mqtt/data:/app/data
        environment:
        - TZ=Europe/Berlin
    ```

2. Als nächstes Sollte eine Standart Konfig gebaut werden.
   Hier kann die Offizelle oder die für den ioBroker Optimierte genommen werden.
   Dazu eine unter ./zigbee2mqtt/data/ die Datei configuration.yaml anlegen.

   Originale Konfiguration:

   ```yml
   # Let new devices join our zigbee network
   permit_join: true
   # Docker-Compose makes the MQTT-Server available using "mqtt" hostname
   mqtt:
   base_topic: zigbee2mqtt
   server: mqtt://mqtt
   # Zigbee Adapter path
   serial:
   port: /dev/ttyUSB0
   # Enable the Zigbee2MQTT frontend
   frontend:
   port: 8080
   advanced:
   pan_id: Your Data
   ext_pan_id: Your Data
   channel: Your Data
   network_key: Your Data
   ```

   Für den Adapter **Optimierte und empfohlene** Version - Werte mit "Your Data" müssen dabei an euere Umgebung angepasst werden

   ```yml
   homeassistant: false
   permit_join: true
   frontend:
   port: 8080
   host: 0.0.0.0
   mqtt:
   base_topic: zigbee2mqtt
   server: mqtt://Your Data:1885
   serial:
   port: /dev/ttyACM0
   advanced:
   pan_id: Your Data
   ext_pan_id: Your Data
   channel: Your Data
   network_key: Your Data
   last_seen: ISO_8601_local
   homeassistant_legacy_entity_attributes: false
   legacy_api: false
   legacy_availability_payload: false
   output: json
   transmit_power: 20
   log_level: warn
   device_options:
   legacy: false
   availability: true
   ```
    Hier ein Beispiel aus der Konfiguration des Zigbee Adapters im ioBroker und wie diese Umgeändert eingetragen werden muss:

   ![Zigbee Konfiguration](../img/zigbeeAdpter.png)

   ```yml
   mqtt:
   base_topic: zigbee2mqtt
   server: mqtt://192.168.1.1:1885 # IOBrocker IP Adresse mit MQTT Adapter oder MQTT Server siehe Zigbee2MQTT Doku
   Serial:
   port: /dev/ttyACM0 #Pfad zur Zigbee Antenne
   advanced:
   pan_id: 1A2C #PAN ID aus dem ioBroker konvertiert zu Hex
   ext_pan_id: [0x00, 0x12, 0x4b, 0x02, 0x37, 0xb9, 0x88] #erweiterte PAN ID aus dem ioBroker und in der schreibweise [0xDD, 0xDD, 0xDD, 0xDD, 0xDD, 0xDD, 0xDD, 0xDD]

   channel: 15 #Kannal aus dem ioBroker
   network_key: [0x02, 0x03, 0x05, 0x08, 0x09, 0x0B, 0x0D, 0x0B, 0x00, 0x02, 0x04, 0x07, 0x08, 0x0A, 0x0C, 0x0D] # Netzwerkkey/Transportschlüssel und in der schreibweise [0xDD, 0xDD, 0xDD, 0xDD, 0xDD, 0xDD, 0xDD, 0xDD]
   ```
   Dabei ist zu bedachten das die Werte im HEX Format eingetragen werden und in der richtigen Schreibweise.
   Hex Converter Online: https://www.rapidtables.com/convert/number/hex-to-decimal.html
3. Habt das alles erledigt dann kann mit `docker-compose up -d` die Docker configuration über nommen werden und die Container gestatet werden.
   Nach einer Kurzen zeit können wir uns dann mit http://Dockerhost-IP:8080 mit dem Webinterface von Zigbee2MQTT Verbunden werden.

4. Installation des Zigbee2MQTT Adpaters über den Adapter Tab im ioBroker

5. Konfiguration des Adpaters
   - Server = IP des Zigbee2MQTT Servers (in unserem Falle die IP des Docker Host)
   - Port = 8080 Ist der Standart Port, Wenn dieser in der Config von Zigbee2MQTT geändert wird muss der hier auch geändert werden
   - Verwende Kelvin Werte anstelle von Mired = Einstellung der Einheit für Farbtemperaturen für z.B. Lampen
   - Proxy Zigbee2MQTT Protokolle zu ioBroker Protokolle = Übernimmt die Protokolle aus Zigbee2MQTT in das ioBroker Log
   - Debug-Protokolle Aktivieren = **Aktiviert Extreme Debug Protokolle** Sollte nur auf Anweisung oder wenn man weis was man tut aktiviert werden. 
   
   ![Zigbee2MQTT Konfiguration](../img/Zigbee2MQTT_Adapter.png)

6. Draft - umzug der Geräte
   - Zigbee Adapater ausmachen
   - Zigbee2MQTT Container herrunter fahren
   - Datenbank kopieren von Nach
   - Zigbee2MQTT Container starten
   - kurz warten