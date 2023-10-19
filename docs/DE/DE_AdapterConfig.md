### Konfiguration des Adapters
| Option | Wert/Beschreibung |
|--|--|
|**Wählen und konfiguriere die Zigbee2MQTT Verbindung**|
|Zigbee2MQTT Verbindung auswählen |Empfohlene Einstellung "Websocket" |
|Scheme|Auswahl zwischen Websocket (WS) via HTTP oder HTTPS (WS SSL)|
|Websocket IP-Adresse |IP oder DNS Name des Zigbee2MQTT Servers (in unserem Falle die IP des Docker Host)|
| Websocket Port | 8080 Ist der Standard Port, wenn dieser in der Config von Zigbee2MQTT geändert wird, muss der hier auch geändert werden |
| Auth-Token Verwenden|Aktivieren, um einen Auth-Token/Passwort zur Konfigurationsseite zu hinterlegen. !!! ACHTUNG!!! Sonderzeichen werden nicht unterstützt. Weitere Infos bei [Zigbee2MQTT](https://www.zigbee2mqtt.io/guide/configuration/frontend.html#advanced-configuration)|
 |Dummy MQTT-Server für Zigbee2MQTT erstellen | Da wir ja für Zigbee2MQTT einen MQTT Server brauchen können wir diesen Harken setzten dann haben wir die Möglichkeit einen solchen hier im Adapter zu erstellen.
|MQTT-Server IP-Adresse binden/MQTT-Server-Port | diese Einstellungen tauchen nur auf, wenn wir den Harken für den Dummy MQTT Server gesetzt haben. Sollte auf dem ioBroker kein weiter MQTT Server vorhanden sein, können wir die Standardeinstellungen so belassen, andernfalls muss mindestens der Port geändert werden. Diese Einstellungen sollten dann auch in der Config von Zigbee2MQTT hinterlegt werden.|
|Konfiguration der Zigbee2MQTT Web UI Verbindung Konfiguration|Hier kann die Verbindung konfiguriert werden, wie die Zigbee2MQTT Web UI in den ioBroker eingebunden werden soll. Wichtig ist: Wird der ioBroker via HTTPS aufgerufen, muss auch hier eine Verbindung via HTTPS aufgebaut werden. Ansonsten kommt es zu dem Fehler: (https://github.com/o0shojo0o/ioBroker.zigbee2mqtt/issues/12)
|**Konfiguration der Zigbee2MQTT WebUi Verbindung**|
| Farbtemperatur mit Farbe synchronisieren | Diese Einstellung sorgt dafür, dass z. B. in einer VIS wie Lovelace sich die Farbe der Lampe zur eingestellten Farbe ändert.
|Verwende Kelvin Werte anstelle von Mired | Einstellung der Einheit für Farbtemperaturen für z.B. Lampen
|**State Konfigurationen**|
| Generiert einfache „Hold“ und „Release“ States|Bei Aktivierung werden die Datenpunkte „Hold“ und „Release“ kombiniert und der Datenpunkt „Hold“ bleibt true, bis das Ereignis „Release“ eintrifft.|
| Generiert einfache „Move“ und „Stop“ States|Bei Aktivierung werden die Datenpunkte „Move“ und „Stop“ kombiniert und der Datenpunkt „Move“ bleibt true, bis das Ereignis „Stop“ eintrifft.|
| Generieren einfache „Press“ und „Release“ States|Wenn diese Option aktiviert ist, werden die Zustände „Press“ und „Release“ kombiniert und der Datenpunkt „Press“ bleibt true, bis das Ereignis „Release“ eintrifft.|
| Brightness move soll auch das Licht ein- oder ausschalten| Bei Aktivierung wird, wenn die Helligkeit via Brightness move bei 0 angekommen ist, die Lampe ausgeschaltet. Und wenn die Lampe aus ist, wird diese auch wieder eingeschaltet.
| Brightness step soll auch das Licht ein- oder ausschalten | Bei Aktivierung wird, wenn die Helligkeit via Brightness step bei 0 angekommen ist, wird die Lampe ausgeschaltet. Und wenn die Lampe aus ist wird diese auch wieder eingeschaltet.
|**Device image configurations**|
|Device Bilder von Zigbee2Mqtt herunterladen und als Objektsymbole verwenden.|Mit dieser Einstellung wird das Vorschaubild von zigbee2MQTT heruntergeladen, komprimiert und anschließend im zugehörigen Objekt hinterlegt. ACHTUNG der erste Start nach setzten dieser Einstellung dauert je nach Anzahl an Geräten länger |
|Size of the object icons in pixels|Größen der Bilder, 28 ist hier der Standard. Größer sollte man diese nur auf eigene Gefahr machen. |
|**Andere Konfigurationen**|
| Automatische Prüfung auf fehlende Router im Speicher des Koordinators. |Diese Option überprüft alle Geräte, die theoretisch Router des Zigbee-Netzwerkes sein könnten und listet alle auf, die es nicht sind. Weitere Informationen findet man unter https://www.zigbee2mqtt.io/guide/usage/mqtt_topics_and_messages.html#zigbee2mqtt-bridge-request-coordinator-check |
| Proxy Zigbee2MQTT Protokolle zu ioBroker Protokolle | Übernimmt die Protokolle aus Zigbee2MQTT in das ioBroker Log|


![Zigbee2MQTT Basis Konfiguration](../img/baseConfig.png)
![Zigbee2MQTT Erweiterte Konfiguration](../img/extendedConfig.png)
