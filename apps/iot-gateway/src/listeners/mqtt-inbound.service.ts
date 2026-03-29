import { Injectable, OnApplicationBootstrap, Logger } from '@nestjs/common';
import { MqttService } from '@app/common/mqtt/mqtt.service';
import { RedisService } from '@app/redis-cache';
import { Queue } from 'bullmq';
import { isEqual } from 'lodash';
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

      // Serialize nested objects for Redis hmset
      const shadowData: Record<string, string | number | boolean> = {};
      for (const [key, value] of Object.entries(rawData)) {
        if (typeof value === 'object' && value !== null) {
          shadowData[key] = JSON.stringify(value);
        } else {
          shadowData[key] = value as string | number | boolean;
        }
      }

      // 1. LWT standard: rely on broker's keep_alive. Delete if LWT offline msg, else set online indefinitely.
      const previousStatus = await this.redisService.get(`status:${deviceToken}`);
      const newEvent = rawData.online === false ? 'offline' : 'online';

      if (rawData.online === false) {
        await this.redisService.del(`status:${deviceToken}`);
      } else {
        await this.redisService.set(`status:${deviceToken}`, 'online');
      }

      // ★ Ghi lịch sử kết nối khi trạng thái thay đổi thực sự
      const wasOnline = previousStatus === 'online';
      const isNowOnline = newEvent === 'online';
      if (wasOnline !== isNowOnline) {
        await this.statusQueue.add(
          DEVICE_JOBS.RECORD_CONNECTION_LOG,
          { token: deviceToken, event: newEvent },
          { removeOnComplete: true, attempts: 2 },
        );
      }

      // 2. Write shadow − using the key device.service also reads: hgetall `device:shadow:{token}`
      await this.redisService.hmset(`device:shadow:${deviceToken}`, shadowData);

      // 3. Queue lastSeen DB update (debounced in worker)
      await this.statusQueue.add(DEVICE_JOBS.UPDATE_LAST_SEEN, {
        token: deviceToken,
        rawData,
      });

      this.logger.log(
        `Device ${deviceToken} status updated: ${JSON.stringify(rawData)}`,
      );

      // ★ Process for state history as well, since firmware might bundle telemetry inside the status message
      await this.handleStateMessage(topic, payload);
    } catch (error) {
      this.logger.error(`Failed to handle status message: ${error.message}`);
    }
  }

  // Telemetry (nhiệt độ, độ ẩm...) — TODO: push to TimescaleDB
  private async handleTelemetryMessage(_topic: string, _payload: Buffer) {
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

      // Serialize nested objects for Redis hmset
      const shadowData: Record<string, string | number | boolean> = {};
      for (const [key, value] of Object.entries(rawData)) {
        if (typeof value === 'object' && value !== null) {
          shadowData[key] = JSON.stringify(value);
        } else {
          shadowData[key] = value as string | number | boolean;
        }
      }

      // 1. Lưu Shadow State thô (debug)
      await this.redisService.hmset(`device:shadow:${token}`, shadowData);

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
        state?: number | string | boolean;
        attributes?: Array<{ key: string; value: number | string | boolean }>;
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
        const attrUpdates: Array<{ key: string; value: number | string | boolean }> = [];
        for (const attr of entity.attributes) {
          const attrConfig = attr.config as { commandKey?: string } | null;
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

          // ★ Ghi lịch sử khi PRIMARY STATE thay đổi (OPEN→CLOSE, ON→OFF...)
          let hasStateChanged = false;
          if (entityUpdate.state !== undefined) {
             hasStateChanged = !isEqual(entityUpdate.state, oldState.state);
          }

          if (hasStateChanged) {
            // Only record history for primitive states (strings or numbers)
            const isNumber = typeof entityUpdate.state === 'number';
            const isString = typeof entityUpdate.state === 'string';
            
            if (isNumber || isString) {
              await this.statusQueue.add(
                DEVICE_JOBS.RECORD_STATE_HISTORY,
                {
                  entityId: entity.id,
                  value: isNumber ? entityUpdate.state : null,
                  valueText: isString ? String(entityUpdate.state) : null,
                  source: rawData.source || 'mqtt',
                },
                { removeOnComplete: true, attempts: 2 },
              );
            }
          }

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
