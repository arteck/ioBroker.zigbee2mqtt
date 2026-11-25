'use strict';

/** Längste Anlerndauer, die Zigbee2MQTT für permit_join annimmt (Sekunden). */
const PERMIT_JOIN_MAX_TIME = 254;

/**
 * Anlernen neuer Geräte (permit_join) über die States
 * info.permit_join (Schalter), info.permit_join_timeout (Restsekunden) und
 * info.pairing_message (letzte Meldung zum Anlernen, z.B. "Device 0x… joined").
 *
 * Der tatsächliche Zustand kommt immer von Zigbee2MQTT (bridge/info); der Schalter
 * wird erst bestätigt (ack), wenn Zigbee2MQTT das Öffnen bzw. Schließen meldet.
 * Geöffnet wird der Schalter nur, solange der letzte bridge/state "online" war.
 */
class PermitJoinController {
    /**
     * Erstellt eine neue PermitJoinController-Instanz.
     *
     * @param {object}       adapter Die ioBroker-Adapter-Instanz
     * @param {() => number} [now]   Uhr in Millisekunden (für Tests austauschbar)
     */
    constructor(adapter, now = Date.now) {
        this.adapter = adapter;
        this.now = now;
        // letzter von Zigbee2MQTT gemeldeter Zustand (null = noch unbekannt)
        this.open = null;
        // Zeitpunkt (ms), zu dem das Anlernen endet; 0 = kein bekanntes Ende
        this.endTime = 0;
        // Intervall des Sekunden-Countdowns, solange das Anlernen offen ist
        this.countdownTimer = null;
        // true nach allTimerClear(): kein neuer Countdown mehr
        this.unloaded = false;
        // letzter bridge/state: true = online, false = offline gemeldet,
        // null = unbekannt (Adapterstart oder Verbindung zu Zigbee2MQTT weg)
        this.bridgeOnline = null;
        // bridge/info, das bei unbekanntem bridge/state eintraf (retained-Nachrichten kommen
        // nach dem Verbinden in beliebiger Reihenfolge); wird bei "online" übernommen
        this.pendingInfo = null;
    }

    /**
     * Erzeugt die Zigbee2MQTT-Anfrage zum Öffnen (true) oder Schließen (false) des Anlernens.
     * "time" verlangt Zigbee2MQTT 2.x, "value" Zigbee2MQTT 1.x; beide ignorieren das jeweils andere Feld.
     *
     * @param {ioBroker.StateValue} val Gewünschter Zustand
     * @returns {{topic: string, payload: {value: boolean, time: number}}} Die Z2M-Nachricht
     */
    static createRequest(val) {
        const open = val === true || val === 'true' || val === 1;
        return {
            topic: 'bridge/request/permit_join',
            payload: { value: open, time: open ? PERMIT_JOIN_MAX_TIME : 0 },
        };
    }

    /**
     * Übernimmt permit_join aus bridge/info (wird von Zigbee2MQTT bei jeder Änderung neu gesendet).
     *
     * @param {object} payload Der Payload des bridge/info-Topics
     */
    async onBridgeInfo(payload) {
        if (!payload || typeof payload.permit_join !== 'boolean') {
            return;
        }
        if (this.bridgeOnline !== true) {
            // Zigbee2MQTT nicht online: nie öffnen (z.B. ein veraltetes retained bridge/info).
            // Bei unbekanntem Zustand wird es übernommen, sobald bridge/state "online" meldet.
            this.pendingInfo = this.bridgeOnline === null ? payload : null;
            return;
        }
        let open = payload.permit_join;
        let remaining = 0;
        if (open) {
            if (typeof payload.permit_join_end === 'number') {
                // Zigbee2MQTT 2.x: Endzeitpunkt in ms
                remaining = Math.ceil((payload.permit_join_end - this.now()) / 1000);
                // Ein (z.B. retained) bridge/info, dessen Ende schon vorbei ist, gilt als geschlossen
                if (remaining <= 0) {
                    open = false;
                }
            } else if (typeof payload.permit_join_timeout === 'number') {
                // Zigbee2MQTT 1.x: Restsekunden
                remaining = payload.permit_join_timeout;
            }
        }
        remaining = open ? Math.min(Math.max(remaining, 0), PERMIT_JOIN_MAX_TIME) : 0;

        const wasOpen = this.open;
        this.open = open;

        await this.adapter.setStateChangedAsync('info.permit_join', open, true);
        await this.adapter.setStateChangedAsync('info.permit_join_timeout', remaining, true);

        if (open && remaining > 0) {
            this.endTime = this.now() + remaining * 1000;
            this.startCountdown();
        } else {
            this.endTime = 0;
            this.stopCountdown();
        }

        if (open && wasOpen !== true) {
            await this.setMessage(remaining > 0 ? `Pairing open for ${remaining} seconds` : 'Pairing open');
        } else if (!open && wasOpen === true) {
            await this.setMessage('Pairing closed');
        }
    }

    /**
     * Übernimmt bridge/state. "online" übernimmt ein vorher eingetroffenes bridge/info;
     * jeder andere Zustand schließt das Anlernen, bis Zigbee2MQTT wieder "online" meldet.
     *
     * @param {boolean} online true, wenn Zigbee2MQTT "online" meldet
     */
    async onBridgeState(online) {
        if (!online) {
            await this.close('Zigbee2MQTT offline', false);
            return;
        }
        this.bridgeOnline = true;
        const pending = this.pendingInfo;
        this.pendingInfo = null;
        if (pending) {
            await this.onBridgeInfo(pending);
        }
    }

    /**
     * Meldet Beitritt und Interview neuer Geräte aus bridge/event in info.pairing_message.
     *
     * @param {object} payload Der Payload des bridge/event-Topics
     */
    async onBridgeEvent(payload) {
        if (!payload || typeof payload !== 'object') {
            return;
        }
        const data = payload.data || {};
        const device = data.ieee_address || data.friendly_name;
        if (!device) {
            return;
        }

        if (payload.type === 'device_joined') {
            await this.setMessage(`Device ${device} joined`);
        } else if (payload.type === 'device_interview') {
            if (data.status === 'started') {
                await this.setMessage(`Interview started: ${device}`);
            } else if (data.status === 'successful') {
                const def = data.definition;
                const what = def && (def.vendor || def.model)
                    ? [def.vendor, def.model].filter((x) => x).join(' ')
                    : 'device not supported';
                await this.setMessage(`Interview successful: ${device}, ${what}`);
            } else if (data.status === 'failed') {
                await this.setMessage(`Interview failed: ${device}`);
            }
        }
    }

    /**
     * Wertet die Antwort auf bridge/request/permit_join aus. Bei einem Fehler wird der
     * Schalter auf den letzten von Zigbee2MQTT gemeldeten Zustand zurückgesetzt.
     *
     * @param {object} payload Der Payload des bridge/response/permit_join-Topics
     */
    async onPermitJoinResponse(payload) {
        if (!payload || payload.status !== 'error') {
            return;
        }
        await this.onRequestFailed(payload.error || 'unknown error');
    }

    /**
     * Die Anfrage zum Öffnen/Schließen kam nicht bei Zigbee2MQTT an oder wurde abgelehnt:
     * Schalter auf den letzten von Zigbee2MQTT gemeldeten Zustand zurücksetzen (ack) und den Grund melden.
     *
     * @param {string} reason Grund, z.B. "no connection to Zigbee2MQTT"
     */
    async onRequestFailed(reason) {
        await this.adapter.setStateAsync('info.permit_join', this.open === true, true);
        await this.setMessage(`Pairing failed: ${reason}`);
    }

    /**
     * Zigbee2MQTT ist nicht (mehr) erreichbar oder der Adapter startet neu: Das Anlernen wird
     * als geschlossen gemeldet, bis Zigbee2MQTT mit bridge/info wieder den echten Zustand liefert.
     * Eine Meldung gibt es nur, wenn das Anlernen bis dahin offen war.
     * Läuft im selben Mutex wie messageParse (siehe closePermitJoin in main.js).
     *
     * @param {string}     reason         Grund, z.B. "connection to Zigbee2MQTT lost"
     * @param {false|null} [bridgeOnline] false: Zigbee2MQTT meldet offline; null: Zustand unbekannt
     */
    async close(reason, bridgeOnline = null) {
        this.bridgeOnline = bridgeOnline;
        this.pendingInfo = null;
        this.stopCountdown();
        this.endTime = 0;
        const state = await this.adapter.getStateAsync('info.permit_join');
        const wasOpen = this.open === true || !!(state && state.val === true);
        this.open = false;
        if (!state || state.val !== false || state.ack !== true) {
            await this.adapter.setStateAsync('info.permit_join', false, true);
        }
        await this.adapter.setStateChangedAsync('info.permit_join_timeout', 0, true);
        if (wasOpen) {
            await this.setMessage(`Pairing closed: ${reason}`);
        }
    }

    /**
     * Schreibt die Restsekunden; beendet den Countdown bei 0.
     * Das Schließen selbst meldet Zigbee2MQTT anschließend über bridge/info.
     */
    async countdownTick() {
        const remaining = Math.max(0, Math.ceil((this.endTime - this.now()) / 1000));
        if (remaining === 0) {
            this.stopCountdown();
        }
        await this.adapter.setStateChangedAsync('info.permit_join_timeout', remaining, true);
    }

    /** Startet den Sekunden-Countdown (falls nicht schon aktiv und der Adapter nicht entladen wird). */
    startCountdown() {
        if (this.countdownTimer || this.unloaded) {
            return;
        }
        this.countdownTimer = setInterval(() => {
            this.countdownTick().catch((e) => this.adapter.log.error(`permit_join countdown: ${e.message || e}`));
        }, 1000);
    }

    /** Stoppt den Sekunden-Countdown. */
    stopCountdown() {
        if (this.countdownTimer) {
            clearInterval(this.countdownTimer);
            this.countdownTimer = null;
        }
    }

    /**
     * Schreibt eine Meldung in info.pairing_message und ins Log.
     *
     * @param {string} message Die Meldung
     */
    async setMessage(message) {
        this.adapter.log.info(message);
        await this.adapter.setStateAsync('info.pairing_message', message, true);
    }

    /**
     * Stoppt alle Timer (beim Entladen des Adapters). Danach startet auch ein noch in der
     * messageParse-Warteschlange stehendes bridge/info keinen neuen Countdown mehr.
     */
    allTimerClear() {
        this.unloaded = true;
        this.stopCountdown();
    }
}

module.exports = {
    PermitJoinController,
    PERMIT_JOIN_MAX_TIME,
};
