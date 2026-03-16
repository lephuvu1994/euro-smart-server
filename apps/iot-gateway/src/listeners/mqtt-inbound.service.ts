import { Injectable, OnApplicationBootstrap, Logger } from '@nestjs/common';
import { MqttService } from '@app/common/mqtt/mqtt.service';
import { RedisService } from '@app/redis-cache';
import { Queue } from 'bullmq';
import { InjectQueue } from '@nestjs/bullmq';
import { APP_BULLMQ_QUEUES } from '@app/common';
import { DEVICE_JOBS } from '@app/common';
import { DatabaseService } from '@app/database';

@Injectable()
export class MqttInboundService implements OnApplicationBootstrap {
  private readonly logger = new Logger(MqttInboundService.name);
  constructor(
    private readonly databaseService: DatabaseService,
    private mqttService: MqttService,
    private redisService: RedisService,
    @InjectQueue(APP_BULLMQ_QUEUES.DEVICE_STATUS)
    private statusQueue: Queue,
    @InjectQueue(APP_BULLMQ_QUEUES.DEVICE_CONTROL)
    private deviceControlQueue: Queue,
  ) {}

  // 3. Đổi tên hàm từ onModuleInit -> onApplicationBootstrap
  onApplicationBootstrap() {
    // QoS 0: Status/heartbeat — gửi liên tục, mất 1 bản không sao
    this.mqttService.subscribe(
      '+/+/+/status',
      this.handleStatusMessage.bind(this),
      { qos: 0 },
    );
    // QoS 0: Telemetry — dữ liệu cảm biến gửi thường xuyên
    this.mqttService.subscribe(
      '+/+/+/telemetry',
      this.handleTelemetryMessage.bind(this),
      { qos: 0 },
    );
    // QoS 1: State feedback — phản hồi trạng thái, cần đảm bảo nhận được
    this.mqttService.subscribe(
      '+/+/+/state',
      this.handleStateMessage.bind(this),
      { qos: 1 },
    );

    console.log('MqttInboundService initialized subscribers');
  }

  private async handleStatusMessage(topic: string, payload: Buffer) {
    const deviceToken = this.extractToken(topic);
    if (!deviceToken) return;

    try {
      const rawData = JSON.parse(payload.toString());
      const redisKey = `device:shadow:${deviceToken}`;

      // 1. Lấy dữ liệu hiện tại trong Shadow
      const currentState = await this.redisService.hgetall(redisKey);

      // 2. Cập nhật dữ liệu mới vào Redis (Dùng hset để chỉ cập nhật các field gửi lên)
      await this.redisService.hset(redisKey, rawData);

      // 3. Tạo Full State để bắn Socket (Giúp App không bị mất UI)
      // Merge dữ liệu cũ và dữ liệu mới
      const fullState = { ...currentState, ...rawData };

      // 4. Đẩy vào Queue xử lý DB (Last Seen, History...)
      await this.statusQueue.add(DEVICE_JOBS.UPDATE_LAST_SEEN, {
        token: deviceToken,
        rawData: fullState, // Gửi full state để worker có đủ data
      });

      // 5. Bắn Socket (Gửi fullState thay vì rawData)
      this.redisService.publish(
        'socket:emit',
        JSON.stringify({
          room: `device_${deviceToken}`, // Room theo Device Token
          event: 'DEVICE_UPDATE',
          data: fullState,
        }),
      );

      this.logger.log(
        `Device ${deviceToken} status updated: ${JSON.stringify(rawData)}`,
      );
    } catch (error) {
      this.logger.error(`Failed to handle status message: ${error.message}`);
    }
  }

  // Xử lý Telemetry (Nhiệt độ, độ ẩm...)
  private async handleTelemetryMessage(topic: string, payload: Buffer) {
    // Parse JSON -> Update Redis Shadow -> Push to TimescaleDB Worker
  }

  // [NÂNG CẤP] Xử lý Phản hồi trạng thái (Feedback) thông minh
  public async handleStateMessage(topic: string, payload: Buffer) {
    const token = this.extractToken(topic);

    try {
      const rawData = JSON.parse(payload.toString());
      // rawData ví dụ: { "state": "ON", "start_hour": 8, "learn_rf": "SUCCESS" }

      // 1. Lưu Shadow State thô (để debug nhanh nếu cần)
      await this.redisService.hmset(`shadow:${token}`, rawData);

      // 2. Lấy thông tin Device và Features để map dữ liệu
      // (Lưu ý: Để tối ưu hiệu năng production, nên cache cấu trúc này vào Redis thay vì query DB)
      const device = await this.databaseService.device.findUnique({
        where: { token },
        include: { features: true },
      });

      if (!device || !device.features) return;

      const updates = [];

      // 3. VÒNG LẶP XỬ LÝ FEATURE (Core Logic)
      for (const feature of device.features) {
        const config = feature.config as any; // { commandKey, embeddedKeys, ... }
        let newValue = null;

        // --- TRƯỜNG HỢP A: Feature đơn (Key-Value trực tiếp) ---
        // Ví dụ: Feature "Điều khiển" (state), Feature "Learn RF" (learn_rf)
        if (config.commandKey && rawData[config.commandKey] !== undefined) {
          newValue = rawData[config.commandKey];
        }

        // --- TRƯỜNG HỢP B: Feature Grouping (Cấu hình gộp) ---
        // Ví dụ: Feature "Cài đặt" chứa ["start_hour", "req_open_clicks"...]
        else if (config.embeddedKeys && Array.isArray(config.embeddedKeys)) {
          const groupData = {};
          let hasData = false;

          // Lọc: Chỉ lấy những key thuộc về Feature này
          config.embeddedKeys.forEach((key) => {
            if (rawData[key] !== undefined) {
              groupData[key] = rawData[key];
              hasData = true;
            }
          });

          // Nếu trong payload có chứa dữ liệu của nhóm này -> Cập nhật
          if (hasData) {
            // Merge với giá trị cũ trong Redis để không bị mất các setting khác
            const oldJson = await this.redisService.get(
              `device:${device.id}:feature:${feature.code}`,
            );
            const oldValue = oldJson ? JSON.parse(oldJson) : {};

            newValue = { ...oldValue, ...groupData };
          }
        }

        // 4. Nếu phát hiện có thay đổi -> Cập nhật Redis & Chuẩn bị Socket
        if (newValue !== null) {
          // Chuẩn hóa dữ liệu để lưu
          const finalValue =
            typeof newValue === 'object'
              ? JSON.stringify(newValue)
              : String(newValue);

          // Update Redis cho Feature cụ thể
          const featureKey = `device:${device.id}:feature:${feature.code}`;
          await this.redisService.sadd(
            `device:${device.id}:_fkeys`,
            featureKey,
          );
          await this.redisService.set(featureKey, finalValue);

          // (Option) Update DB Last Value để persistence
          // await this.databaseService.deviceFeature.update(...)

          updates.push({
            featureId: feature.id,
            featureCode: feature.code,
            value: newValue, // Gửi nguyên object hoặc value cho Frontend dễ render
          });
        }
      }

      // 5. Bắn Socket báo cho Frontend (Chỉ bắn 1 lần gói gọn các thay đổi)
      if (updates.length > 0) {
        this.redisService.publish(
          'socket:emit',
          JSON.stringify({
            room: `device_${token}`, // Room theo Device Token
            event: 'DEVICE_UPDATE',
            data: {
              deviceId: device.id,
              token: token,
              updates: updates, // Frontend sẽ loop qua mảng này để update từng UI component
              timestamp: new Date(),
            },
          }),
        );

        // 6. Đẩy job đánh giá scene trigger DEVICE_STATE (cảm biến / trạng thái thiết bị)
        await this.deviceControlQueue.add(
          DEVICE_JOBS.CHECK_DEVICE_STATE_TRIGGERS,
          {
            deviceToken: token,
            updates: updates.map((u: any) => ({
              featureCode: u.featureCode,
              value: u.value,
            })),
          },
          { priority: 3, attempts: 1, removeOnComplete: true },
        );
      }
    } catch (e) {
      this.logger.error(
        `Invalid JSON or Error in state message from ${token}: ${e.message}`,
      );
    }
  }
  private extractToken(topic: string): string {
    // ✅ Thêm dòng này để bảo vệ hàm khỏi giá trị null hoặc undefined
    if (!topic || typeof topic !== 'string') {
      return null;
    }

    const parts = topic.split('/');
    if (!parts || parts.length < 4) {
      console.error(`Invalid topic format: ${topic}`);
      return null;
    }
    // Ví dụ topic: "COMPANY_A/DEVICE_CODE/DEVICE_TOKEN/status"
    return parts[2];
  }
}
