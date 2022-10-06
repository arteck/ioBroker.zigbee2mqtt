# FAQ

Hier werden die meist gestellten Fragen beantwortet. Grundsätzlich kann aber die offizielle Dokumentation von Zigbee2MQTT befragt werden. 
Dieses WIKI klärt primär Fragen zum Umgang mit dem Adapter und nicht mit dem Zigbee2MQTT selber.

Offizielle Dokumentation: https://www.zigbee2mqtt.io/guide/getting-started

# Inhaltsübersicht
1. [Verbidung/Konfigurationsseite zu Zigbee2MQTT wird nicht angezeigt im ioBrocker](#1)
2. [Frage2](#2)
3. [Frage3](#3)
4. [Frage4](#3)

## Verbidung/Konfigurationsseite zu Zigbee2MQTT wird nicht angezeigt im ioBrocker <a name="1"></a>
Ausgangssituattion:
Nutzt man im ioBroker Admin eine verschlüsselte Verbindung über HTTPS lädt der Browser die eingebettete Zigbee2MQTT UI nicht.

Ursache:
Leider kann in Zigbee2MQTT (noch) keine Verschlüsselte Verbindung konfigurirt werden. Durch die Verwendung der HTTPS Verbindung des Admin Adapter kann leider keine unverschlüsselte iFrame Verbindung genutzt werden, was hier der Fall ist.

Lösung:
1. Deaktivieren der HTTPS verbindung im Admin Adapter
2. Proxy Verbindung für die Konfigurationsseite von Zigbee2MQTT, noch ist aber nicht klar ob die Websocket Verbindung die dieser Adpter nutzt dann noch funktioniert.

## Frage2 <a name="2"></a>
Antwort2

## Frage3 <a name="3"></a>
Antwort3
## Frage4 <a name="4"></a>
Antwort4
