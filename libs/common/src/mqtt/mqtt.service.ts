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
  private subscriptions: {
    pattern: string;
    callback: (topic: string, payload: Buffer) => void;
    options?: mqtt.IClientSubscribeOptions;
  }[] = [];
  private readonly logger = new Logger(MqttService.name);
  /** Flag để không schedule reconnect sau khi module bị destroy */
  private isDestroyed = false;

  constructor(private configService: ConfigService) {}

  onModuleInit() {
    this.connect();
  }

  onModuleDestroy() {
    this.isDestroyed = true;
    this.disconnect();
  }

  private connect() {
    const host = this.configService.get<string>('MQTT_HOST');
    const port = this.configService.get<number>('MQTT_PORT');
    const username = this.configService.get<string>('MQTT_USER');
    const password = this.configService.get<string>('MQTT_PASS');

    this.logger.log(`Connecting to MQTT Broker at ${host}:${port}...`);

    this.client = mqtt.connect(host, {
      port,
      username,
      password,
      reconnectPeriod: 5000, // Tự động reconnect sau 5s nếu mất mạng
      connectTimeout: 10_000,
    });

    // ── Khi kết nối thành công (bao gồm cả re-connect) ─────────────────
    // QUAN TRỌNG: mqtt.js dùng clean_start=true nên server xoá session cũ
    // sau mỗi lần disconnect. Phải subscribe lại tất cả topics sau mỗi lần
    // connect thành công để tránh subscriptions=0 bug.
    this.client.on('connect', () => {
      this.logger.log('✅ MQTT Connected Successfully');
      this.reconnectDelay = 10_000; // reset backoff on successful connect

      for (const sub of this.subscriptions) {
        this.client.subscribe(sub.pattern, sub.options || { qos: 0 }, (err) => {
          if (err) {
            this.logger.error(
              `Re-subscribe error on "${sub.pattern}": ${err.message}`,
            );
          } else {
            this.logger.log(`✅ Re-subscribed to: ${sub.pattern}`);
          }
        });
      }
    });

    this.client.on('error', (err) => {
      this.logger.error(`MQTT Error: ${err.message}`);

      // BUG FIX: mqtt.js v4+ dừng reconnect hoàn toàn khi nhận CONNACK rc=5
      // (Not Authorized). Điều này xảy ra khi core-api chưa sẵn sàng lúc deploy
      // (đang chạy Prisma migrations). Force reconnect với exponential backoff.
      if (
        !this.isDestroyed &&
        (err.message.includes('Not authorized') ||
          err.message.includes('Connection refused') ||
          err.message.includes('Bad username'))
      ) {
        this.scheduleReconnect(10_000);
      }
    });

    this.client.on('offline', () => {
      this.logger.warn('MQTT Client is offline');
    });

    this.client.on('reconnect', () => {
      this.logger.log('MQTT attempting reconnect...');
    });

    // Handle all incoming messages and route based on active subscriptions
    this.client.on('message', (receivedTopic, payload) => {
      for (const sub of this.subscriptions) {
        if (this.matches(sub.pattern, receivedTopic)) {
          sub.callback(receivedTopic, payload);
        }
      }
    });
  }

  // Hàm public để các module khác publish message
  async publish(
    topic: string,
    message: string | object,
    options?: mqtt.IClientPublishOptions,
  ): Promise<void> {
    return new Promise((resolve, reject) => {
      const payload =
        typeof message === 'object' ? JSON.stringify(message) : message;

      if (!this.client || !this.client.connected) {
        const err = new Error(
          `MQTT not connected — cannot publish to "${topic}"`,
        );
        this.logger.error(err.message);
        return reject(err);
      }

      this.client.publish(topic, payload, options ?? {}, (err) => {
        if (err) {
          this.logger.error(`Publish failed to "${topic}": ${err.message}`);
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
    if (!this.client) {
      this.logger.error(
        `Cannot subscribe to "${topic}": MQTT Client not initialized.`,
      );
      return;
    }

    // Lưu vào routing table — sẽ được replay trong 'connect' handler sau reconnect
    this.subscriptions.push({ pattern: topic, callback, options });

    if (this.client.connected) {
      // Connected ngay → subscribe luôn
      this.client.subscribe(topic, options || {}, (err) => {
        if (err) this.logger.error(`Subscribe error on "${topic}": ${err.message}`);
        else this.logger.log(`Subscribed to: ${topic} (QoS ${options?.qos ?? 0})`);
      });
    } else {
      // Offline → topic đã lưu vào list, sẽ được subscribe khi 'connect' fire
      this.logger.warn(
        `MQTT offline — queued subscribe for "${topic}", will activate on next connect.`,
      );
    }
  }

  private reconnectDelay = 10_000;

  private scheduleReconnect(delay: number) {
    if (this.isDestroyed) return;
    this.reconnectDelay = Math.min(delay * 1.5, 60_000); // cap at 60s
    this.logger.warn(
      `Auth/Connection error detected — forcing reconnect in ${Math.round(delay / 1000)}s...`,
    );
    setTimeout(() => {
      if (!this.isDestroyed && !this.client.connected) {
        this.logger.log('Executing forced MQTT reconnect...');
        try {
          this.client.reconnect();
        } catch (reconnectErr) {
          this.logger.error(`Force reconnect failed: ${reconnectErr.message}`);
          // If reconnect() threw, schedule another attempt
          this.scheduleReconnect(this.reconnectDelay);
        }
      }
    }, delay);
  }

  private matches(pattern: string, topic: string): boolean {
    const patternSegments = pattern.split('/');
    const topicSegments = topic.split('/');

    let i = 0;
    while (i < patternSegments.length && i < topicSegments.length) {
      const p = patternSegments[i];
      const t = topicSegments[i];

      if (p === '#') return true; // '#' matches all remaining levels
      if (p !== '+' && p !== t) return false; // Mismatch on specific level

      i++;
    }

    return i === patternSegments.length && i === topicSegments.length;
  }

  private disconnect() {
    if (this.client) {
      this.client.end();
    }
  }
}
