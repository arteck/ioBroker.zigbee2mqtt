### Konfiguration des Adapters
| Option | Wert |
|--|--|
| Zigbee2MQTT Verbindung auswählen |Empfohlene Einstellung "Websocket" |
| Websocket IP-Adresse |IP oder DNS Name des Zigbee2MQTT Servers (in unserem Falle die IP des Docker Host)|
|Websocket Port | 8080 Ist der Standard Port, wenn dieser in der Config von Zigbee2MQTT geändert, wird muss der hier auch geändert werden|
|Dummy MQTT-Server für Zigbee2MQTT erstellen | Da wir ja für Zigbee2MQTT einen MQTT Server brauchen können wir diesen Harken setzten dann haben wir die Möglichkeit einen solchen hier im Adapter zu erstellen
|MQTT-Server IP-Adresse binden/MQTT-Server-Port | diese Einstellungen tauchen nur auf, wenn wir den Harken für den Dummy MQTT Server gesetzt haben. Sollte auf dem ioBroker kein weiter MQTT Server vorhanden sein, können wir die Standardeinstellungen so belassen, andernfalls muss mindestens der Port geändert werden. Diese Einstellungen sollten dann auch in der Config von Zigbee2MQTT hinterlegt werden.
|Konfiguration der Zigbee2MQTT Web UI Verbindung Konfiguration|Hier kann die Verbindung konfiguriert werden, wie die Zigbee2MQTT Web UI in den ioBroker eingebunden werden soll. Wichtig ist: Wird der ioBroker via HTTPS aufgerufen, muss auch hier eine Verbindung via HTTPS aufgebaut werden. Ansonsten kommt es zu dem Fehler: (https://github.com/o0shojo0o/ioBroker.zigbee2mqtt/issues/12)
|Farbtemperatur mit Farbe synchronisieren | Diese Einstellung sorgt dafür, dass z.b. in einer VIS wie Lovelace sich die Farbe der Lampe zur eingestellten Farbe ändert.
|Verwende Kelvin Werte anstelle von Mired | Einstellung der Einheit für Farbtemperaturen für z.B. Lampen
|Brightness move soll auch das Licht ein- oder ausschalten| Bei Aktivierung wird, wenn die Helligkeit via Brightness move bei 0 angekommen ist, wird die Lampe ausgeschaltet.
|Brightness step soll auch das Licht ein- oder ausschalten|Bei Aktivierung wird, wenn die Helligkeit via Brightness step bei 0 angekommen ist, wird die Lampe ausgeschaltet.
|Proxy Zigbee2MQTT Protokolle zu ioBroker Protokolle | Übernimmt die Protokolle aus Zigbee2MQTT in das ioBroker Log
  

![Zigbee2MQTT Konfiguration](../img/Zigbee2MQTT_Adapter.png)