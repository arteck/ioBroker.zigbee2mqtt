const axios = require('axios').default;
const sharp = require('sharp');

class ImageController {
    constructor(adapter) {
        this.adapter = adapter;
    }

    sanitizeModelIDForImageUrl(modelName) {
        return modelName.replace('/', '_');
    }

    sanitizeZ2MDeviceName(deviceName) {
        return deviceName ? deviceName.replace(/:|\s|\//g, '-') : 'NA';
    }

    getZ2mDeviceImage(device) {
        if (device && device.definition && device.definition.model) {
            return `https://www.zigbee2mqtt.io/images/devices/${this.sanitizeZ2MDeviceName(device.definition.model)}.jpg`;
        }
    }

    getSlsDeviceImage(device) {
        if (device && device.model_id) {
            return `https://slsys.github.io/Gateway/devices/png/${this.sanitizeModelIDForImageUrl(device.model_id)}.png`;
        }
    }

    async getDeviceIcon(device) {
        if (this.adapter.config.useDeviceIcons == false) {
            return '';
        }

        const imageSize = this.adapter.config.deviceIconsSize;

        const z2mIconFileName = `${this.sanitizeZ2MDeviceName(device.definition.model)}.jpg`;
        const slsIconFileName = `${this.sanitizeModelIDForImageUrl(device.model_id)}.png`;

        let icon;
        let iconFileName;
        // Check whether an image has already been downloaded from Z2M.
        if (await this.adapter.fileExistsAsync(this.adapter.namespace, z2mIconFileName)) {
            iconFileName = z2mIconFileName;
        }
        // Check whether an image has already been downloaded from SLSys.
        else if (await this.adapter.fileExistsAsync(this.adapter.namespace, slsIconFileName)) {
            iconFileName = slsIconFileName;
        }
        // If not donwload image
        else {
            let iconUrl = this.getZ2mDeviceImage(device);
            if (!iconUrl) {
                iconUrl = this.getSlsDeviceImage(device);
            }
            this.adapter.log.info(`Download image for device model: ${device.definition.model}`);
            await this.downloadIcon(this.adapter, iconUrl, this.adapter.namespace);
            iconFileName = this.getFileNameWithExtension(iconUrl);
        }

        if ((await this.adapter.fileExistsAsync(this.adapter.namespace, iconFileName)) == false) {
            this.adapter.log.warn(`No image for device model: ${device.definition.model} found!`);
            return '';
        }

        try {
            // Load image from the Meta-Store
            icon = await this.adapter.readFileAsync(this.adapter.namespace, iconFileName);
            // Load Image Metadata
            const origIconMeta = await sharp(icon.file).metadata();
            // Check whether the image needs to be resized
            if ((origIconMeta.height && origIconMeta.height > imageSize) || (origIconMeta.width && origIconMeta.width > imageSize)) {
                // Resize image to 28x28 pixel
                this.adapter.log.info(`Resize image for device model ${device.definition.model} from: ${origIconMeta.width}x${origIconMeta.height} to ${imageSize}x${imageSize}`);
                icon.file = await sharp(icon.file)
                    .resize({
                        width: imageSize,
                        height: imageSize,
                        fit: sharp.fit.cover,
                        position: sharp.strategy.entropy
                    })
                    .toBuffer();
                // Replace the original image with the resize image.
                await this.adapter.writeFileAsync(this.adapter.namespace, iconFileName, icon.file);
            }
        } catch (error) {
            this.adapter.log.warn(error);
            return '';
        }
        // Create and output Base64
        return `data:image/png;base64,${icon.file.toString('base64')}`;

    }
    getFileNameWithExtension(url) {
        const path = new URL(url).pathname;
        const filename = path.split('/').pop();
        return filename;
    }

    async downloadIcon(adapter, url, namespace) {
        try {
            const res = await axios.get(url, { responseType: 'arraybuffer' });
            await adapter.writeFileAsync(namespace, this.getFileNameWithExtension(url), res.data);
        }
        catch (ex) {
            adapter.log.warn(ex);
        }
    }
}
module.exports = {
    ImageController,
};