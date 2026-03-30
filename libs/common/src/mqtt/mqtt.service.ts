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
  private subscriptions: { pattern: string; callback: (topic: string, payload: Buffer) => void }[] = [];
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

    this.client.on('error', (err) => {
      this.logger.error(`MQTT Error: ${err.message}`);
    });

    this.client.on('offline', () => {
      this.logger.warn('MQTT Client is offline');
    });

    // Handle all incoming messages and route them based on active subscriptions
    this.client.on('message', (receivedTopic, payload) => {
      for (const sub of this.subscriptions) {
        if (this.matches(sub.pattern, receivedTopic)) {
          sub.callback(receivedTopic, payload);
        }
      }
    });
  }

  // Hàm public để các module khác gọi
  async publish(
    topic: string,
    message: string | object,
    options?: mqtt.IClientPublishOptions,
  ): Promise<void> {
    return new Promise((resolve, reject) => {
      const payload =
        typeof message === 'object' ? JSON.stringify(message) : message;

      this.client.publish(topic, payload, options, (err) => {
        if (err) {
          this.logger.error(`Publish failed to ${topic}: ${err.message}`);
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
    options?: mqtt.IClientSubscribeOptions,
  ) {
    // THÊM ĐOẠN CHECK NÀY
    if (!this.client) {
      this.logger.error(
        `Cannot subscribe to ${topic}: MQTT Client is not initialized yet.`,
      );
      return;
    }

    // Register callback logic to our routing table
    this.subscriptions.push({ pattern: topic, callback });

    this.client.subscribe(topic, options || {}, (err) => {
      if (err) this.logger.error(`Subscribe error: ${err.message}`);
      else
        this.logger.log(`Subscribed to: ${topic} (QoS ${options?.qos ?? 0})`);
    });
  }

  private matches(pattern: string, topic: string): boolean {
    const patternSegments = pattern.split('/');
    const topicSegments = topic.split('/');

    let i = 0;
    while (i < patternSegments.length && i < topicSegments.length) {
      const p = patternSegments[i];
      const t = topicSegments[i];

      if (p === '#') {
        return true; // '#' matches all remaining levels
      }
      
      if (p !== '+' && p !== t) {
        return false; // Mismatch on specific level
      }

      i++;
    }

    // Must match exact length unless ending in '#'
    return i === patternSegments.length && i === topicSegments.length;
  }

  private disconnect() {
    if (this.client) {
      this.client.end();
    }
  }
}
