# FAQ

Hier werden die meist gestellten Fragen beantwortet. Grundsätzlich kann aber die offizielle Dokumentation von Zigbee2MQTT befragt werden. 
Dieses WIKI klärt primär Fragen zum Umgang mit dem Adapter und nicht mit dem Zigbee2MQTT selber.

Offizielle Dokumentation: https://www.zigbee2mqtt.io/guide/getting-started

# Inhaltsübersicht
- [FAQ](#faq)
- [Inhaltsübersicht](#inhaltsübersicht)
  - [Verbidung/Konfigurationsseite zu Zigbee2MQTT wird nicht angezeigt im ioBroker ](#verbidungkonfigurationsseite-zu-zigbee2mqtt-wird-nicht-angezeigt-im-iobroker-)
  - [Was ist der Unterschied zwischen diesem Adapter und dem ioBroker/Zigbee Adapter? ](#was-ist-der-unterschied-zwischen-diesem-adapter-und-dem-iobrokerzigbee-adapter-)
  - [Was genau ist Zigbee2MQTT/Z2M? ](#was-genau-ist-zigbee2mqttz2m-)
  - [Wie erhalte ich die Expositionsdaten eines Geräts? ](#wie-erhalte-ich-die-expositionsdaten-eines-geräts-)
  - [Welche Zigbee2MQTT Konfigurationsparameter werden benötigt?? ](#welche-zigbee2mqtt-konfigurationsparameter-werden-benötigt-)
  - [Warum werden Geräte in ioBroker nach dem löschen aus z2m nicht auch gelöscht? ](#warum-werden-geräte-in-iobroker-nach-dem-löschen-aus-z2m-nicht-auch-gelöscht-)


## Verbidung/Konfigurationsseite zu Zigbee2MQTT wird nicht angezeigt im ioBroker <a name="1"></a>
Ausgangssituattion:

Nutzt man im ioBroker Admin eine verschlüsselte Verbindung über HTTPS lädt der Browser die eingebettete Zigbee2MQTT UI nicht.

Ursache:

Leider kann in Zigbee2MQTT (noch) keine Verschlüsselte Verbindung konfigurirt werden. Durch die Verwendung der HTTPS Verbindung des Admin Adapter kann leider keine unverschlüsselte iFrame Verbindung genutzt werden, was hier der Fall ist.

Lösung:
1. Deaktivieren der HTTPS verbindung im Admin Adapter
2. Proxy Verbindung für die Konfigurationsseite von Zigbee2MQTT, noch ist aber nicht klar ob die Websocket Verbindung die dieser Adpter nutzt dann noch funktioniert.

## Was ist der Unterschied zwischen diesem Adapter und dem ioBroker/Zigbee Adapter? <a name="2"></a>
Der ioBroker/Zigbee Adapter nutzt die Datenbasis von Zigbee2MQTT, jedoch verwaltet dieser seine Geräte selber.

Dieser Zigbee2MQTT Adapter lagert die Verwaltung der Geräte an die offizielle Software aus und holt sich nur die Daten aus dieser, um die Geräte via ioBroker zu steuern. 
Heißt, das Zigbee Netz läuft unabhängig vom ioBroker. ein aus Entwicklersicht viel größer Vorteil ist es, dass neue Funktionen nicht durch ein 1-3 Mann Team umgesetzt werden muss (sowie bei dem ioBroker/Zigbee Adapter), sondern durch ein viel größeres Team mit einigen Hundert Entwicklern und einer noch viel größeren Community, da Zigbee2MQTT auch von diversen anderen Systemen als Basis genutzt wird. 

## Was genau ist Zigbee2MQTT/Z2M? <a name="3"></a>
Zigbee2MQTT ist ein Open-Source-Projekt (vermutlich DAS Projekt, wenn es um Zigbee im Open Source Bereich geht), mit dem Zigbee Geräte über MQTT direkt angesprochen und verwaltet werden können, ohne dass hierfür eine Bridge eines Herstellers benötigt wird. Somit ist es auch möglich Geräte mehrere Hersteller über ein System zu verwalten, ohne dass man zu Hause immer die Bridge des jeweiligen Herstellers braucht. 
Zigbee2MQTT ist die Basis vieler Verschiedener SmartHome Zentralen, wie FEHM, HomeAssitent und jetzt auch ioBroker, wenn es um die Verwaltung von Zigbee Geräten geht.
Bedeutet aber auch das hier eine zusätzliche Software installiert, eingerichtet und gepflegt werden muss!

## Wie erhalte ich die Expositionsdaten eines Geräts? <a name="4"></a>

- Sie müssen die IEEE-Adresse (`0x......`) des betroffenen Geräts in den Datenpunkt `zigbee2mqtt.[X].info.debugmessages` schreiben
- Anschliesed den Adapter neustarten
- Nun tauchen im Log Warnmeldungen auf die ungefähr folgendes Aussehen haben: `-->> fromZ2M -> 0x...... exposes:`

## Welche Zigbee2MQTT Konfigurationsparameter werden benötigt?? <a name="5"></a>

Dieser Adapter basiert auf dem aktuellen JSON Payload von Zigbee2MQTT, daher wird der Legacy Modus nicht unterstützt.  
Das bedeutet, dass die folgenden Konfigurationsparameter **zwingend notwendig** sind, damit der Adapter richtig funktioniert!

```yaml
advanced:
    <deine anderen Parameter>
    legacy_api: false
    legacy_availability_payload: false
    cache_state: false
    output: json
device_options:
    legacy: false
availability: true
```


## Warum werden Geräte in ioBroker nach dem löschen aus z2m nicht auch gelöscht? <a name="5"></a>
Da die Datenpunkte sehr dynamisch erstellt werden und um eventuellen Fehler vorzubeugen, werden die Geräte nicht gelöscht. Den sonst würden die benutzerdefinierten Einstellungen (falls vorhanden) des Datenpunktes verloren gehen.
Normalerweise sollte der Name durch "Device removed!" ersetzt werden und available sollte auf "false" gesetzt werden, somit kann man dann die Datenpunkte nachträglich löschen wenn es gewünscht ist.