import { Injectable, Logger } from '@nestjs/common';
import { MqttService } from '@app/common/mqtt/mqtt.service';
import { IDeviceDriver } from '../interfaces/device-driver.interface';
import { DeviceFeature } from '@prisma/client';

@Injectable()
export class ZigbeeGenericDriver implements IDeviceDriver {
    name = 'zigbee'; // Khớp với Enum DeviceProtocol
    private readonly logger = new Logger(ZigbeeGenericDriver.name);

    constructor(private mqttService: MqttService) {}

    // SỬA: Thêm kiểu trả về Promise<boolean>
    async setValue(device: any, feature: any, value: any): Promise<boolean> {
        try {
            // 1. Lấy Config
            const featuresConfig = device.deviceModel.featuresConfig as any;
            // Cần xử lý trường hợp featuresConfig là object hoặc array tùy schema của bạn
            // Giả sử featuresConfig là { features: [...] }
            const featureConfig = featuresConfig.features?.find(
                (f: any) => f.code === feature.code
            );

            if (!featureConfig?.mqtt) {
                this.logger.error(
                    `Missing MQTT config for feature ${feature.code}`
                );
                return false; // Trả về false nếu lỗi
            }

            const config = featureConfig.mqtt;

            // 2. Render Topic
            const topic = config.topicPattern
                .replace('{{partnerCode}}', device.partner.code)
                .replace('{{deviceToken}}', device.token);

            // 3. Render Payload
            let payloadStr = '';
            if (feature.type === 'BINARY') {
                const template = value ? config.payloadOn : config.payloadOff;
                payloadStr = JSON.stringify(template);
            } else {
                payloadStr = JSON.stringify(config.payloadTemplate).replace(
                    '{{value}}',
                    value
                );
            }

            // 4. Gửi lệnh
            await this.mqttService.publish(topic, payloadStr, { qos: 1 });

            return true; // <--- QUAN TRỌNG: Phải return true để khớp với Interface
        } catch (error) {
            this.logger.error(
                `Failed to set value for device ${device.token}: ${error.message}`
            );
            return false; // Trả về false nếu gửi thất bại
        }
    }

    async setValueBulk(
        device: any,
        features: DeviceFeature[]
    ): Promise<boolean> {
        try {
            // 1. Lấy Config
            const featuresConfig = device.deviceModel.featuresConfig as any;
            // Cần xử lý trường hợp featuresConfig là object hoặc array tùy schema của bạn
            // Giả sử featuresConfig là { features: [...] }
            const featureConfig = featuresConfig.features?.find(
                (f: any) => f.code === features[0].code
            );

            if (!featureConfig) {
                this.logger.error(
                    `Missing MQTT config for feature ${features[0].code}`
                );
                return false; // Trả về false nếu lỗi
            }

            const config = featureConfig.mqtt;

            const topic = config.topicPattern
                .replace('{{partnerCode}}', device.partner.code)
                .replace('{{deviceToken}}', device.token);
            const payloadStr = JSON.stringify(
                features.map(f => {
                    if (f.lastValue) {
                        return { [f.code]: f.lastValue };
                    }
                    return { [f.code]: f.lastValueString || '' };
                })
            );
            await this.mqttService.publish(topic, payloadStr, { qos: 1 });

            return true; // <--- QUAN TRỌNG: Phải return true để khớp với Interface
        } catch (error) {
            this.logger.error(
                `Failed to set value bulk for device ${device.token}: ${error.message}`
            );
            return false; // Trả về false nếu gửi thất bại
        }
    }
}
