import { Injectable, OnApplicationBootstrap, Logger } from '@nestjs/common';
import { MqttService } from '@app/common/mqtt/mqtt.service';
import { RedisService } from '@app/redis-cache';
import { Queue } from 'bullmq';
import { isEqual } from 'lodash';
import { InjectQueue } from '@nestjs/bullmq';
import { APP_BULLMQ_QUEUES, DEVICE_JOBS, EDeviceAlertEvent, EDeviceConnectionStatus } from '@app/common';
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
    @InjectQueue(APP_BULLMQ_QUEUES.PUSH_NOTIFICATION)
    private notificationQueue: Queue,
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
      // ★ UNBIND CHECK — detect soft-deleted devices before processing status
      const unboundDevice = await this.databaseService.device.findFirst({
        where: { token: deviceToken, unboundAt: { not: null } },
        select: {
          id: true,
          token: true,
          partner: { select: { code: true } },
          deviceModel: { select: { code: true } },
        },
      });

      if (unboundDevice) {
        this.logger.warn(
          `[UNBIND] Device ${deviceToken} is unbound. Sending unbind command...`,
        );

        const cmdTopic = `${unboundDevice.partner.code}/${unboundDevice.deviceModel.code}/${deviceToken}/set`;

        // ★ PARALLEL: publish + hard-delete are independent
        await Promise.all([
          this.mqttService.publish(cmdTopic, JSON.stringify({ action: 'unbind' }), { qos: 1 }),
          this.deviceControlQueue.add(
            DEVICE_JOBS.HARD_DELETE_DEVICE,
            { deviceId: unboundDevice.id, token: deviceToken },
            { priority: 1, attempts: 2, removeOnComplete: true },
          ),
        ]);

        return; // Stop processing — device is being unbound
      }

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

      // ★ SEQUENTIAL: must read previousStatus BEFORE writing new status
      const previousStatus = await this.redisService.get(`status:${deviceToken}`);
      const newEvent = rawData.online === false ? EDeviceConnectionStatus.OFFLINE : EDeviceConnectionStatus.ONLINE;

      // ★ PARALLEL: all remaining operations are independent of each other
      const parallel: Promise<unknown>[] = [];

      // 1. Write new status to Redis
      if (rawData.online === false) {
        parallel.push(this.redisService.del(`status:${deviceToken}`));
      } else {
        parallel.push(this.redisService.set(`status:${deviceToken}`, 'online'));
      }

      // 2. Write shadow
      parallel.push(this.redisService.hmset(`device:shadow:${deviceToken}`, shadowData));

      // 3. Queue lastSeen DB update (debounced in worker)
      parallel.push(
        this.statusQueue.add(DEVICE_JOBS.UPDATE_LAST_SEEN, { token: deviceToken, rawData }),
      );

      // 4. Connection log + Push notification (only when status actually changed)
      const wasOnline = previousStatus === 'online';
      const isNowOnline = newEvent === EDeviceConnectionStatus.ONLINE;
      if (wasOnline !== isNowOnline) {
        // Connection log — independent
        parallel.push(
          this.statusQueue.add(
            DEVICE_JOBS.RECORD_CONNECTION_LOG,
            { token: deviceToken, event: newEvent },
            { removeOnComplete: true, attempts: 2 },
          ),
        );

        // Device lookup → notification dispatch (chained, but parallel to everything else)
        parallel.push(
          this.databaseService.device.findUnique({
            where: { token: deviceToken },
            select: { id: true, name: true },
          }).then((device) => {
            if (!device) return;
            const jobName = newEvent === EDeviceConnectionStatus.OFFLINE ? 'push_offline_alert' : 'push_online_alert';
            const alertEvent = newEvent === EDeviceConnectionStatus.OFFLINE ? EDeviceAlertEvent.OFFLINE : EDeviceAlertEvent.ONLINE;
            const titleKey = `device.alert.${newEvent}.title`;
            const bodyKey = `device.alert.${newEvent}.body`;
            return this.notificationQueue.add(
              jobName,
              {
                type: 'deviceAlert',
                payload: {
                  deviceId: device.id,
                  eventType: alertEvent,
                  titleKey,
                  bodyKey,
                  data: { deviceName: device.name },
                },
              },
              { removeOnComplete: true, attempts: 1 },
            );
          }),
        );
      }

      // 5. Process state history (firmware may bundle telemetry in status message)
      parallel.push(this.handleStateMessage(topic, payload));

      this.logger.log(`Device ${deviceToken} status updated: ${JSON.stringify(rawData)}`);

      await Promise.all(parallel);
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

      // Serialize nested objects for Redis hmset
      const shadowData: Record<string, string | number | boolean> = {};
      for (const [key, value] of Object.entries(rawData)) {
        if (typeof value === 'object' && value !== null) {
          shadowData[key] = JSON.stringify(value);
        } else {
          shadowData[key] = value as string | number | boolean;
        }
      }

      // ★ PARALLEL: shadow write + DB query are independent
      const [, device] = await Promise.all([
        this.redisService.hmset(`device:shadow:${token}`, shadowData),
        this.databaseService.device.findUnique({
          where: { token },
          include: {
            entities: { include: { attributes: true } },
          },
        }),
      ]);

      if (!device || !device.entities) return;

      const updates: Array<{
        entityId: string;
        entityCode: string;
        state?: number | string | boolean;
        attributes?: Array<{ key: string; value: number | string | boolean }>;
      }> = [];

      // Collect all entity Redis keys to batch-read old states
      const entityKeyMap = new Map<string, { entity: typeof device.entities[0]; update: (typeof updates)[0] }>();

      // 3. ENTITY MAPPING — pure synchronous computation
      for (const entity of device.entities) {
        let entityUpdated = false;
        const entityUpdate: (typeof updates)[0] = {
          entityId: entity.id,
          entityCode: entity.code,
        };

        // Case A: Primary state
        if (entity.commandKey && rawData[entity.commandKey] !== undefined) {
          entityUpdate.state = rawData[entity.commandKey];
          entityUpdated = true;
        }

        // Case B: Attributes
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

        if (entityUpdated) {
          const entityRedisKey = `device:${device.id}:entity:${entity.code}`;
          entityKeyMap.set(entityRedisKey, { entity, update: entityUpdate });
        }
      }

      if (entityKeyMap.size === 0) return;

      // ★ PARALLEL: batch-read all old entity states at once
      const entityKeys = [...entityKeyMap.keys()];
      const oldJsons = await Promise.all(
        entityKeys.map((k) => this.redisService.get(k)),
      );

      // ★ PARALLEL: persist all entity states + history + notifications concurrently
      const writePromises: Promise<unknown>[] = [];

      for (let i = 0; i < entityKeys.length; i++) {
        const entityRedisKey = entityKeys[i];
        const mapEntry = entityKeyMap.get(entityRedisKey);
        if (!mapEntry) continue;
        
        const { entity, update: entityUpdate } = mapEntry;
        const oldState = oldJsons[i] ? JSON.parse(oldJsons[i] as string) : {};
        const newState = { ...oldState };

        if (entityUpdate.state !== undefined) {
          newState.state = entityUpdate.state;
        }
        if (entityUpdate.attributes) {
          for (const a of entityUpdate.attributes) {
            newState[a.key] = a.value;
          }
        }

        // Redis writes — independent, parallelizable
        writePromises.push(
          this.redisService.sadd(`device:${device.id}:_ekeys`, entityRedisKey),
        );
        writePromises.push(
          this.redisService.set(entityRedisKey, JSON.stringify(newState)),
        );

        // State history + notification — only when primary state changed
        if (entityUpdate.state !== undefined && !isEqual(entityUpdate.state, oldState.state)) {
          const isNumber = typeof entityUpdate.state === 'number';
          const isString = typeof entityUpdate.state === 'string';

          if (isNumber || isString) {
            const stateLabel = String(entityUpdate.state);

            // Both queue jobs are independent — push in parallel
            writePromises.push(
              this.statusQueue.add(
                DEVICE_JOBS.RECORD_STATE_HISTORY,
                {
                  entityId: entity.id,
                  value: isNumber ? entityUpdate.state : null,
                  valueText: isString ? stateLabel : null,
                  source: rawData.source || 'mqtt',
                },
                { removeOnComplete: true, attempts: 2 },
              ),
            );

            // Physical/remote push notification - only for non-app sources to avoid echo
            if (rawData.source !== 'app') {
              writePromises.push(
                this.notificationQueue.add(
                  'push_state_change',
                  {
                    type: 'deviceAlert',
                    payload: {
                      deviceId: device.id,
                      eventType: EDeviceAlertEvent.STATE_CHANGE,
                      titleKey: 'device.alert.stateChange.title',
                      bodyKey: 'device.alert.stateChange.body',
                      data: {
                        deviceName: device.name ?? 'Thiết bị',
                        entityName: entity.name,
                        state: stateLabel,
                        source: rawData.source || 'mqtt',
                      },
                    },
                  },
                  { removeOnComplete: true, attempts: 1 },
                ),
              );
            }
          }
        }

        updates.push(entityUpdate);
      }

      // 5. Trigger scene evaluation — add to the parallel batch
      if (updates.length > 0) {
        writePromises.push(
          this.deviceControlQueue.add(
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
          ),
        );
      }

      await Promise.all(writePromises);
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
