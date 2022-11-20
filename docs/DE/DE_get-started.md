# Installation

Die Installation des Adapters erfordert einige Vorarbeiten. 
Hier wird die grundlegende Installation inkl. aller Voraussetzungen beschrieben. Detaillierte Informationen, Anleitungen und Einstellungen findet ihr auf der Seite von Zigbee2MQTT.

`ACHTUNG: Sollte der Koordinator vorher schon einmal woanders im Einsatz gewesen sein muss dieser zurückgesetzt werden, ansonsten kommet es hier zu Fehlern.` 


## Installation

In unserem Beispiel wird Zigbee2MQTT via Docker / Docker Compose eingerichtet. Weitere Einrichtungsmethoden findet ihr auf der offiziellen Dokumentation.
Als Voraussetzung ist hier ein eingereichter Docker Server geben!

1. Vorhanden oder neue Docker-Compose.yml bearbeiten und um folgenden Eintrag ergänzen.
   Wichtig ist nur, dass diese Einstellungen an eure Umgebung angepasst werden, z.B. der Pfad zur USB Antenne unter "devices" oder der Pfad zur Konfigurationsdatei unter "volumes".

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

2. Als Nächstes sollte eine Standard-Konfiguration gebaut werden.
   Hier kann die Offizielle oder die für den ioBroker Optimierte Version genommen werden.
   Dazu unter ./zigbee2mqtt/data/ die Datei configuration.yaml anlegen - Werte mit "Your Data" müssen dabei an euere Umgebung angepasst werden
   
   Originale Konfiguration:

   ```yml
    # Let new devices join our zigbee network
    permit_join: true
    mqtt:
        base_topic: zigbee2mqtt
        server: mqtt://Your Data:Your Port (im normall Fall lautet der Port : 1885)
    # Zigbee Adapter path
    serial:
        port: /dev/ttyUSB0
    # Enable the Zigbee2MQTT frontend
    frontend:
        port: 8080
    # Let Zigbee2MQTT generate a new network key on first start
    advanced:
        network_key: GENERATE
   ```

   Für den Adapter **optimierte und empfohlene** Version - Werte mit "Your Data" müssen dabei an euere Umgebung angepasst werden.

   ```yml
    homeassistant: false
    permit_join: true
    frontend:
        port: 8080
        host: 0.0.0.0
    mqtt:
        base_topic: zigbee2mqtt
        server: mqtt://Your Data:Your Port (im normall Fall lautet der Port : 1885)
    serial:
        port: /dev/ttyUSB0
    advanced:
        pan_id: GENERATE
        ext_pan_id: [0xDD, 0xDD, 0xDD, 0xDD, 0xDD, 0xDD, 0xDD, 0xDD]
        channel: 11
        network_key: GENERATE
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
3. Wie zu sehen ist, wird ein MQTT Server benötigt, dieser übernimmt aktuell für diesen Adapter keine Funktion, wird aber zum Starten benötigt.
   Dazu kann im Adapter in ioBroker einer konfiguriert werden oder wie in der Originalen Doku ein zusätzlicher Docker Container (https://www.zigbee2mqtt.io/guide/getting-started/#_2-setup-and-start-zigbee2mqtt) genutzt werden.

4. Habt das alles erledigt, dann kann mit `docker-compose up -d` die Docker Konfiguration übernommen werden und den Container gestaltet werden.
   Nach einer kurzen Zeit können wir uns dann mit http://Dockerhost-IP:8080, mit dem Webinterface von Zigbee2MQTT verbunden werden.

5. Installation des Zigbee2MQTT Adapters über den Adapter Tab im ioBroker

6. Konfiguration des Adapters
   - Zigbee2MQTT Verbindung auswählen = Empfohlene Einstellung "Websocket", mit der Auswahl einer der beiden experimentellen Funktionen via MQTT tauchen noch weitere Einstellungen auf, um die Verbindung via MQTT aufzubauen
   - Websocket IP-Adresse = IP oder DNS Name des Zigbee2MQTT Servers (in unserem Falle die IP des Docker Host)
   - Websocket Port = 8080 Ist der Standard Port, wenn dieser in der Config von Zigbee2MQTT geändert, wird muss der hier auch geändert werden
   - Dummy MQTT-Server für Zigbee2MQTT erstellen = Da wir ja für Zigbee2MQTT einen MQTT Server brauchen können wir diesen Harken setzten dann haben wir die Möglichkeit einen solchen hier im Adapter zu erstellen
   - MQTT-Server IP-Adresse binden/MQTT-Server-Port = diese Einstellungen tauchen nur auf, wenn wir den Harken für den Dummy MQTT Server gesetzt haben. Sollte auf dem ioBroker kein weiter MQTT Server vorhanden sein, können wir die Standardeinstellungen so belassen, andernfalls muss mindestens der Port geändert werden.  Diese Einstellungen sollten dann auch in der Config von Zigbee2MQTT hinterlegt werden.
   - Konfiguration der Zigbee2MQTT Web UI Verbindung Konfiguration = Hier kann die Verbindung konfiguriert werden, wie die Zigbee2MQTT Web UI in den ioBroker eingebunden werden soll. Wichtig ist Wird der ioBroker via HTTPS aufgerufen, muss auch hier eine Verbindung via HTTPS aufgebaut werden. Ansonsten kommt es zu dem Fehler: (https://github.com/o0shojo0o/ioBroker.zigbee2mqtt/issues/12)
   - Farbtemperatur mit Farbe synchronisieren = Diese Einstellung sorgt dafür, dass z.b. in einer VIS wie Lovelace sich die Farbe der Lampe zur eingestellten Farbe ändert.
   - Verwende Kelvin Werte anstelle von Mired = Einstellung der Einheit für Farbtemperaturen für z.B. Lampen
   - Proxy Zigbee2MQTT Protokolle zu ioBroker Protokolle = Übernimmt die Protokolle aus Zigbee2MQTT in das ioBroker Log

 

![Zigbee2MQTT Konfiguration](../img/Zigbee2MQTT_Adapter.png)

7. Nun sollte alles laufen und die Geräte können angelernt werden. Dazu hier eine detaillierte Anleitung: https://www.zigbee2mqtt.io/guide/usage/pairing_devices.html