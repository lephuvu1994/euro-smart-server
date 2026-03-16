import { Injectable, Logger } from '@nestjs/common';
import { MqttService } from '@app/common/mqtt/mqtt.service';
import { IDeviceDriver } from '../interfaces/device-driver.interface';
import { Device, DeviceFeature } from '@prisma/client';

@Injectable()
export class MqttGenericDriver implements IDeviceDriver {
    name = 'mqtt'; // Khớp với Enum DeviceProtocol
    private readonly logger = new Logger(MqttGenericDriver.name);

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

            if (!featureConfig) {
                this.logger.error(
                    `Missing MQTT config for feature ${feature.code}`
                );
                return false; // Trả về false nếu lỗi
            }

            // 2. Render Topic
            const topic = `${device.partner.code}/${device.deviceModel.code}/${device.token}/${featureConfig.commandSuffix}`;

            // 3. Render Payload
            let payloadStr = '';
            if (featureConfig.commandKey) {
                const template = { [featureConfig.commandKey]: value };
                payloadStr = JSON.stringify(template);
            } else if (featureConfig.type === 'CONFIG') {
                payloadStr = JSON.stringify({
                    config: value,
                });
            } else {
                payloadStr = JSON.stringify(value);
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

            // 2. Render Topic
            const topic = `${device.partner.code}/${device.deviceModel.code}/${device.token}/${featureConfig.commandSuffix}`;

            // 3. Render Payload
            let payloadStr = '';
            payloadStr = JSON.stringify(
                features.map(f => {
                    if (f.lastValue) {
                        return { [featureConfig.commandKey]: f.lastValue };
                    }
                    return {
                        [featureConfig.commandKey]: f.lastValueString || '',
                    };
                })
            );

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
}
