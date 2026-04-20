const axios = require('axios').default;
const sharp = require('sharp');

/**
 *
 */
class ImageController {
    /**
     *
     * @param adapter
     */
    constructor(adapter) {
        this.adapter = adapter;
    }

    /**
     *
     * @param modelName
     */
    sanitizeModelIDForImageUrl(modelName) {
        if (!modelName) return 'NA';
        const modelNameString = modelName.replace('/', '_');
        // eslint-disable-next-line no-control-regex
        return modelNameString.replace(/\u0000/g, '');
    }

    /**
     *
     * @param deviceName
     */
    sanitizeZ2MDeviceName(deviceName) {
        if (!deviceName) return 'NA';
        const deviceNameString = deviceName.replace(/:|\s|\//g, '-');
        // eslint-disable-next-line no-control-regex
        return deviceNameString.replace(/\u0000/g, '');
    }

    /**
     * @param device
     * @param ext
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
     * @param device
     */
    getZ2mDeviceImageModelJPG(device) {
        return this._buildZ2mImageUrl(device, 'jpg');
    }

    /**
     * @param device
     */
    getZ2mDeviceImageModelPNG(device) {
        return this._buildZ2mImageUrl(device, 'png');
    }


    /**
     *
     * @param device
     */
    getSlsDeviceImage(device) {
        if (device && device.model_id) {
            const icoString = `https://www.zigbee2mqtt.io/images/devices/${this.sanitizeModelIDForImageUrl(device.model_id)}.png`;
            // eslint-disable-next-line no-control-regex
            return icoString.replace(/\u0000/g, '');
        }
    }

    /**
     *
     * @param device
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
                    //  check next pic
                }
            }
        }

        if (!iconFound || !iconFileName) {
            this.adapter.log.warn(`Failed to download image for device model: ${device.definition.model} - ${device.definition.description}`);
            return '';
        }

        const icon = await this.adapter.readFileAsync(this.adapter.namespace, iconFileName);
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
     *
     * @param url
     */
    getFileNameWithExtension(url) {
        const path = new URL(url).pathname;
        const filename = path.split('/').pop();
        // eslint-disable-next-line no-control-regex
        return filename.replace(/\u0000/g, '');
    }

    /**
     *
     * @param adapter
     * @param url
     * @param namespace
     */
    async downloadIcon(adapter, url, namespace) {
        try {
            const res = await axios.get(url, { responseType: 'arraybuffer' });
            await adapter.writeFileAsync(namespace, this.getFileNameWithExtension(url), res.data);
            return true;
        } catch (ex) {
            //adapter.log.warn(ex);
            return false;
        }
    }
    /**
     *
     * @param z2mIconFileNameJPG
     * @param z2mIconFileNamePNG
     * @param slsIconFileName
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
