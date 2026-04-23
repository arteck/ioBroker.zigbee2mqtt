const axios = require('axios').default;
const sharp = require('sharp');

/**
 * Lädt Geräte-Icons von zigbee2mqtt.io herunter, cacht sie im ioBroker-Dateisystem
 * und skaliert sie auf die konfigurierte Größe.
 */
class ImageController {
    /**
     * Erstellt eine neue ImageController-Instanz.
     *
     * @param {object} adapter Die ioBroker-Adapter-Instanz
     */
    constructor(adapter) {
        this.adapter = adapter;
    }

    /**
     * Bereinigt eine Model-ID für die Verwendung in einer URL (ersetzt '/' durch '_').
     *
     * @param {string} modelName Die zu bereinigende Model-ID
     * @returns {string}         Bereinigte Model-ID oder 'NA' wenn leer
     */
    sanitizeModelIDForImageUrl(modelName) {
        if (!modelName) { return 'NA'; }
        // eslint-disable-next-line no-control-regex
        return modelName.replace(/\//g, '_').replace(/\u0000/g, '');
    }

    /**
     * Bereinigt einen Z2M-Gerätenamen für die Verwendung in einer URL.
     *
     * @param {string} deviceName Der zu bereinigende Gerätename
     * @returns {string}          Bereinigter Name oder 'NA' wenn leer
     */
    sanitizeZ2MDeviceName(deviceName) {
        if (!deviceName) { return 'NA'; }
        // eslint-disable-next-line no-control-regex
        return deviceName.replace(/:|\s|\//g, '-').replace(/\u0000/g, '');
    }

    /**
     * Erstellt die zigbee2mqtt.io-Bild-URL für ein Gerät.
     *
     * @param {object} device Das Geräteobjekt aus dem Z2M-Payload
     * @param {string} ext    Dateiendung ('jpg' oder 'png')
     * @returns {string|undefined} Die Bild-URL oder undefined wenn kein Modell vorhanden
     */
    _buildZ2mImageUrl(device, ext) {
        if (device && device.definition && device.definition.model) {
            const icoString = `https://www.zigbee2mqtt.io/images/devices/${this.sanitizeZ2MDeviceName(device.definition.model)}.${ext}`;
            // eslint-disable-next-line no-control-regex
            return icoString.replace(/\u0000/g, '');
        }
        return undefined;
    }

    /**
     * Gibt die JPG-Bild-URL des Geräts auf zigbee2mqtt.io zurück.
     *
     * @param {object} device Das Geräteobjekt
     * @returns {string|undefined} Die JPG-URL oder undefined
     */
    getZ2mDeviceImageModelJPG(device) {
        return this._buildZ2mImageUrl(device, 'jpg');
    }

    /**
     * Gibt die PNG-Bild-URL des Geräts auf zigbee2mqtt.io zurück.
     *
     * @param {object} device Das Geräteobjekt
     * @returns {string|undefined} Die PNG-URL oder undefined
     */
    getZ2mDeviceImageModelPNG(device) {
        return this._buildZ2mImageUrl(device, 'png');
    }


    /**
     * Gibt die SLS-Bild-URL des Geräts (alternative Quelle) zurück.
     *
     * @param {object} device Das Geräteobjekt mit model_id-Feld
     * @returns {string|undefined} Die Bild-URL oder undefined
     */
    getSlsDeviceImage(device) {
        if (device && device.model_id) {
            const icoString = `https://www.zigbee2mqtt.io/images/devices/${this.sanitizeModelIDForImageUrl(device.model_id)}.png`;
            // eslint-disable-next-line no-control-regex
            return icoString.replace(/\u0000/g, '');
        }
        return undefined;
    }

    /**
     * Lädt das Icon eines Geräts herunter (falls noch nicht gecacht), skaliert es
     * auf die konfigurierte Größe und gibt es als Base64-Data-URL zurück.
     *
     * @param {object} device Das Geräteobjekt aus dem Z2M-bridge/devices-Payload
     * @returns {Promise<string>} Base64-kodiertes Icon als Data-URL oder ''
     */
    async getDeviceIcon(device) {
        if (!this.adapter.config.useDeviceIcons) {
            return '';
        }
        if (!device || !device.definition || !device.definition.model) {
            return '';
        }

        const imageSize = this.adapter.config.deviceIconsSize;
        const z2mModel = device.definition.model || '';
        const z2mIconFileNameJPG = `${this.sanitizeZ2MDeviceName(z2mModel)}.jpg`;
        const z2mIconFileNamePNG = `${this.sanitizeZ2MDeviceName(z2mModel)}.png`;
        const slsIconFileName = `${this.sanitizeModelIDForImageUrl(device.model_id || z2mModel)}.png`;

        let iconFileName = await this.getExistingIconFileName(z2mIconFileNameJPG, z2mIconFileNamePNG, slsIconFileName);
        let iconFound = true;

        if (!iconFileName) {
            const iconUrls = [
                this.getZ2mDeviceImageModelJPG(device),
                this.getZ2mDeviceImageModelPNG(device),
                this.getSlsDeviceImage(device)
            ].filter(Boolean);

            for (const iconUrl of iconUrls) {
                try {
                    iconFound = await this.downloadIcon(this.adapter, iconUrl, this.adapter.namespace);
                    if (iconFound) {
                        iconFileName = this.getFileNameWithExtension(iconUrl);
                        break;
                    }
                } catch (ex) {
                    this.adapter.log.debug(`Icon download failed for ${iconUrl}: ${ex && ex.message ? ex.message : ex}`);
                }
            }
        }

        if (!iconFound || !iconFileName) {
            this.adapter.log.warn(`Failed to download image for device model: ${device.definition.model} - ${device.definition.description}`);
            return '';
        }

        const icon = await this.adapter.readFileAsync(this.adapter.namespace, iconFileName);
        if (!icon || !icon.file) {
            this.adapter.log.warn(`Failed to read icon file: ${iconFileName}`);
            return '';
        }
        const origIconMeta = await sharp(icon.file).metadata();
        if (
            (origIconMeta.height && origIconMeta.height > imageSize) ||
            (origIconMeta.width && origIconMeta.width > imageSize)
        ) {
            this.adapter.log.info(
                `Resize image for device model ${device.definition.model} from: ${origIconMeta.width}x${origIconMeta.height} to ${imageSize}x${imageSize}`
            );
            icon.file = await sharp(icon.file)
                .resize({
                    width: imageSize,
                    height: imageSize,
                    fit: sharp.fit.cover,
                    position: sharp.strategy.entropy,
                })
                .toBuffer();
            await this.adapter.writeFileAsync(this.adapter.namespace, iconFileName, icon.file);
        }

        return `data:image/png;base64,${icon.file.toString('base64')}`;
    }

    /**
     * Extrahiert den Dateinamen (mit Erweiterung) aus einer URL.
     *
     * @param {string} url Die vollständige URL
     * @returns {string}   Dateiname (z.B. "TRADFRI_bulb.jpg")
     */
    getFileNameWithExtension(url) {
        const path = new URL(url).pathname;
        const filename = path.split('/').pop();
        // eslint-disable-next-line no-control-regex
        return filename.replace(/\u0000/g, '');
    }

    /**
     * Lädt ein Icon von der angegebenen URL herunter und speichert es im ioBroker-Dateisystem.
     *
     * @param {object} adapter   Die ioBroker-Adapter-Instanz
     * @param {string} url       Download-URL des Icons
     * @param {string} namespace ioBroker-Namespace (z.B. "zigbee2mqtt.0")
     * @returns {Promise<boolean>} true bei Erfolg, false bei Fehler
     */
    async downloadIcon(adapter, url, namespace) {
        try {
            const res = await axios.get(url, { responseType: 'arraybuffer', timeout: 10000 });
            await adapter.writeFileAsync(namespace, this.getFileNameWithExtension(url), res.data);
            return true;
        } catch (ex) {
            return false;
        }
    }

    /**
     * Prüft welcher lokale Icon-Dateiname bereits im ioBroker-Dateisystem existiert.
     *
     * @param {string} z2mIconFileNameJPG JPG-Dateiname (Z2M-Format)
     * @param {string} z2mIconFileNamePNG PNG-Dateiname (Z2M-Format)
     * @param {string} slsIconFileName    PNG-Dateiname (SLS-Format)
     * @returns {Promise<string|null>}    Erster gefundener Dateiname oder null
     */
    async getExistingIconFileName(z2mIconFileNameJPG, z2mIconFileNamePNG, slsIconFileName) {
        if (await this.adapter.fileExistsAsync(this.adapter.namespace, z2mIconFileNameJPG)) {
            return z2mIconFileNameJPG;
        } else if (await this.adapter.fileExistsAsync(this.adapter.namespace, z2mIconFileNamePNG)) {
            return z2mIconFileNamePNG;
        } else if (await this.adapter.fileExistsAsync(this.adapter.namespace, slsIconFileName)) {
            return slsIconFileName;
        }
        return null;
    }
}
module.exports = {
    ImageController,
};
