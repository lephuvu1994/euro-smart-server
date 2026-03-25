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

  onApplicationBootstrap() {
    // QoS 0: Status/heartbeat
    this.mqttService.subscribe(
      '+/+/+/status',
      this.handleStatusMessage.bind(this),
      { qos: 0 },
    );
    // QoS 0: Telemetry — sensor data
    this.mqttService.subscribe(
      '+/+/+/telemetry',
      this.handleTelemetryMessage.bind(this),
      { qos: 0 },
    );
    // QoS 1: State feedback — device control response
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

      const currentState = await this.redisService.hgetall(redisKey);
      await this.redisService.hset(redisKey, rawData);

      const fullState = { ...currentState, ...rawData };

      await this.statusQueue.add(DEVICE_JOBS.UPDATE_LAST_SEEN, {
        token: deviceToken,
        rawData: fullState,
      });

      this.logger.log(
        `Device ${deviceToken} status updated: ${JSON.stringify(rawData)}`,
      );
    } catch (error) {
      this.logger.error(`Failed to handle status message: ${error.message}`);
    }
  }

  // Telemetry (nhiệt độ, độ ẩm...) — TODO: push to TimescaleDB
  private async handleTelemetryMessage(topic: string, payload: Buffer) {
    // Parse JSON -> Update Redis Shadow -> Push to TimescaleDB Worker
  }

  /**
   * [ENTITY-BASED] Xử lý phản hồi trạng thái từ thiết bị.
   * Map MQTT payload keys → DeviceEntity (via commandKey) + EntityAttribute (via attr config).
   */
  public async handleStateMessage(topic: string, payload: Buffer) {
    const token = this.extractToken(topic);

    try {
      const rawData = JSON.parse(payload.toString());
      // rawData ví dụ: { "state": 1, "brightness": 80, "color_temp": 4000 }

      // 1. Lưu Shadow State thô (debug)
      await this.redisService.hmset(`shadow:${token}`, rawData);

      // 2. Lấy Device + Entities + Attributes
      // TODO: Cache entity structure trong Redis để tránh query DB mỗi message
      const device = await this.databaseService.device.findUnique({
        where: { token },
        include: {
          entities: {
            include: { attributes: true },
          },
        },
      });

      if (!device || !device.entities) return;

      const updates: Array<{
        entityId: string;
        entityCode: string;
        state?: any;
        attributes?: Array<{ key: string; value: any }>;
      }> = [];

      // 3. ENTITY MAPPING LOOP
      for (const entity of device.entities) {
        let entityUpdated = false;
        const entityUpdate: (typeof updates)[0] = {
          entityId: entity.id,
          entityCode: entity.code,
        };

        // --- Case A: Primary state (entity.commandKey → MQTT key) ---
        if (entity.commandKey && rawData[entity.commandKey] !== undefined) {
          entityUpdate.state = rawData[entity.commandKey];
          entityUpdated = true;
        }

        // --- Case B: Attributes (attr commandKey or attr.key → MQTT key) ---
        const attrUpdates: Array<{ key: string; value: any }> = [];
        for (const attr of entity.attributes) {
          const attrConfig = attr.config as any;
          const mqttKey = attrConfig?.commandKey ?? attr.key;

          if (rawData[mqttKey] !== undefined) {
            attrUpdates.push({ key: attr.key, value: rawData[mqttKey] });
          }
        }

        if (attrUpdates.length > 0) {
          entityUpdate.attributes = attrUpdates;
          entityUpdated = true;
        }

        // 4. Persist entity state to Redis
        if (entityUpdated) {
          const entityRedisKey = `device:${device.id}:entity:${entity.code}`;

          // Build entity state object: { state, brightness, color_temp, ... }
          const oldJson = await this.redisService.get(entityRedisKey);
          const oldState = oldJson ? JSON.parse(oldJson) : {};
          const newState = { ...oldState };

          if (entityUpdate.state !== undefined) {
            newState.state = entityUpdate.state;
          }
          if (entityUpdate.attributes) {
            for (const a of entityUpdate.attributes) {
              newState[a.key] = a.value;
            }
          }

          // Track entity keys for device cleanup
          await this.redisService.sadd(
            `device:${device.id}:_ekeys`,
            entityRedisKey,
          );
          await this.redisService.set(entityRedisKey, JSON.stringify(newState));

          updates.push(entityUpdate);
        }
      }

      // 5. Trigger scene + BullMQ updates
      if (updates.length > 0) {
        // Trigger scene DEVICE_STATE evaluation
        await this.deviceControlQueue.add(
          DEVICE_JOBS.CHECK_DEVICE_STATE_TRIGGERS,
          {
            deviceToken: token,
            updates: updates.map((u) => ({
              entityCode: u.entityCode,
              state: u.state,
              attributes: u.attributes,
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
    if (!topic || typeof topic !== 'string') {
      return null;
    }

    const parts = topic.split('/');
    if (!parts || parts.length < 4) {
      console.error(`Invalid topic format: ${topic}`);
      return null;
    }
    // Topic: "COMPANY_A/DEVICE_CODE/DEVICE_TOKEN/status"
    return parts[2];
  }
}
