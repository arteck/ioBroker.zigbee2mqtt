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
        const z2mIconFileName = `${this.sanitizeZ2MDeviceName(device.definition.model)}.jpg`;
        const slsIconFileName = `${this.sanitizeModelIDForImageUrl(device.model_id)}.png`;

        let icon;
        let iconFileName;
        //
        if (await this.adapter.fileExistsAsync(this.adapter.namespace, z2mIconFileName)) {
            iconFileName = z2mIconFileName;
        }
        //
        else if (await this.adapter.fileExistsAsync(this.adapter.namespace, slsIconFileName)) {
            iconFileName = slsIconFileName;
        }
        //
        else {
            let iconUrl = this.getZ2mDeviceImage(device);
            if (!iconUrl) {
                iconUrl = this.getSlsDeviceImage(device);
            }
            this.adapter.log.info(`Download image for device model: ${device.definition.model}`);
            await this.downloadIcon(this.adapter, iconUrl, this.adapter.namespace);
            iconFileName = this.getFileNameWithExtension(iconUrl);
        }

        try {
            // Image aus dem Meta-Store laden
            icon = await this.adapter.readFileAsync(this.adapter.namespace, z2mIconFileName);
            // Image Metadata laden
            const origIconMeta = await sharp(icon.file).metadata();
            // Prüfen ob das Image resize werden muss
            if ((origIconMeta.height && origIconMeta.height > 28) || (origIconMeta.width && origIconMeta.width > 28)) {

                this.adapter.log.info(`Resize image for device model ${device.definition.model} from: ${origIconMeta.width}x${origIconMeta.height} to 28x28`);

                icon.file = await sharp(icon.file).resize({
                    width: 28,
                    height: 28,
                    fit: sharp.fit.cover,
                    position: sharp.strategy.entropy
                }).toBuffer();

                await this.adapter.writeFileAsync(this.adapter.namespace, iconFileName, icon.file);
            }
        } catch (error) {
            this.adapter.log.warn(error);
        }

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