import {
    Injectable,
    OnModuleInit,
    OnModuleDestroy,
    Logger,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as mqtt from 'mqtt'; // npm install mqtt

@Injectable()
export class MqttService implements OnModuleInit, OnModuleDestroy {
    private client: mqtt.MqttClient;
    private readonly logger = new Logger(MqttService.name);

    constructor(private configService: ConfigService) {}

    onModuleInit() {
        this.connect();
    }

    onModuleDestroy() {
        this.disconnect();
    }

    private connect() {
        const host = this.configService.get<string>('MQTT_HOST'); // mqtt://broker.emqx.io
        const port = this.configService.get<number>('MQTT_PORT');
        const username = this.configService.get<string>('MQTT_USER');
        const password = this.configService.get<string>('MQTT_PASS');

        this.logger.log(`Connecting to MQTT Broker at ${host}:${port}...`);

        this.client = mqtt.connect(host, {
            port,
            username,
            password,
            reconnectPeriod: 5000, // Tự động reconnect sau 5s nếu mất mạng
        });

        this.client.on('connect', () => {
            this.logger.log('✅ MQTT Connected Successfully');
        });

        this.client.on('error', err => {
            this.logger.error(`MQTT Error: ${err.message}`);
        });

        this.client.on('offline', () => {
            this.logger.warn('MQTT Client is offline');
        });
    }

    // Hàm public để các module khác gọi
    async publish(
        topic: string,
        message: string | object,
        options?: mqtt.IClientPublishOptions
    ): Promise<void> {
        return new Promise((resolve, reject) => {
            const payload =
                typeof message === 'object' ? JSON.stringify(message) : message;

            this.client.publish(topic, payload, options, err => {
                if (err) {
                    this.logger.error(
                        `Publish failed to ${topic}: ${err.message}`
                    );
                    reject(err);
                } else {
                    resolve();
                }
            });
        });
    }

    subscribe(
        topic: string,
        callback: (topic: string, payload: Buffer) => void,
        options?: mqtt.IClientSubscribeOptions
    ) {
        // THÊM ĐOẠN CHECK NÀY
        if (!this.client) {
            this.logger.error(
                `Cannot subscribe to ${topic}: MQTT Client is not initialized yet.`
            );
            return;
        }

        this.client.subscribe(topic, options || {}, err => {
            if (err) this.logger.error(`Subscribe error: ${err.message}`);
            else
                this.logger.log(
                    `Subscribed to: ${topic} (QoS ${options?.qos ?? 0})`
                );
        });

        this.client.on('message', (receivedTopic, payload) => {
            // Logic match topic đơn giản (hoặc dùng thư viện mqtt-match)
            // Lưu ý: Cần cẩn thận chỗ này kẻo duplicate message nếu subscribe nhiều lần
            // Tốt nhất là dùng thư viện 'mqtt-pattern' để check match
            if (this.matches(topic, receivedTopic)) {
                callback(receivedTopic, payload);
            }
        });
    }

    private matches(pattern: string, topic: string): boolean {
        // Logic đơn giản check topic, có thể dùng thư viện 'mqtt-match'
        const patternSegments = pattern.split('/');
        const topicSegments = topic.split('/');
        // ... (Viết logic check wildcard ở đây hoặc dùng thư viện)
        return true; // Tạm thời return true để test
    }

    private disconnect() {
        if (this.client) {
            this.client.end();
        }
    }
}
