// src/modules/device/processors/device-control.processor.ts
// Single source of truth — worker-service is the ONLY consumer of DEVICE_CONTROL queue.
import { Processor, WorkerHost, OnWorkerEvent } from '@nestjs/bullmq';
import { InjectQueue } from '@nestjs/bullmq';
import { Job, Queue } from 'bullmq';
import { Logger } from '@nestjs/common';
import { APP_BULLMQ_QUEUES } from '@app/common';
import { RedisService } from '@app/redis-cache';
import { IntegrationManager, SceneTriggerType, DEVICE_JOBS, SceneTriggerIndexService } from '@app/common';
import { DatabaseService } from '@app/database';
import { DeviceEntity } from '@prisma/client';

// ---------------------------------------------------------------------------
// Typed interfaces for job payloads (avoid `any`)
// ---------------------------------------------------------------------------

interface ControlCmdPayload {
  token: string;
  entityCode: string;
  value: string | number | boolean;
  userId?: string;
  source?: string;
}

interface EntityPayload {
  entityCode: string;
  value: string | number | boolean;
}

interface ControlDeviceValueCmdPayload {
  token: string;
  entityPayloads: EntityPayload[];
  userId?: string;
}

interface SceneAction {
  deviceToken: string;
  entityCode: string;
  value: string | number | boolean;
}

interface SceneDeviceAction {
  entityCode: string;
  value: string | number | boolean;
}

interface SceneDeviceActionsPayload {
  deviceToken: string;
  actions: SceneDeviceAction[];
}

interface CheckDeviceStateTriggersPayload {
  deviceToken: string;
  updates?: { entityCode: string; state: string | number | boolean; attributes?: Record<string, unknown>[] }[];
}

type CompareOperator = 'eq' | 'ne' | 'gt' | 'gte' | 'lt' | 'lte';

interface ConditionConfig {
  deviceToken: string;
  entityCode: string;
  attributeKey?: string;
  value?: string | number | boolean;
  operator?: CompareOperator;
}

interface EntityState {
  state?: string | number | boolean;
  [key: string]: unknown;
}

@Processor(APP_BULLMQ_QUEUES.DEVICE_CONTROL)
export class DeviceControlProcessor extends WorkerHost {
  private readonly logger = new Logger(DeviceControlProcessor.name);

  constructor(
    private readonly integrationManager: IntegrationManager,
    private readonly databaseService: DatabaseService,
    private readonly redisService: RedisService,
    private readonly sceneTriggerIndexService: SceneTriggerIndexService,
    @InjectQueue(APP_BULLMQ_QUEUES.DEVICE_CONTROL)
    private readonly deviceQueue: Queue,
  ) {
    super();
  }

  async process(job: Job): Promise<unknown> {
    switch (job.name) {
      case DEVICE_JOBS.CONTROL_CMD:
        return await this.handleControlCommand(job);

      case DEVICE_JOBS.CONTROL_DEVICE_VALUE_CMD:
        return await this.handleControlDeviceValueCommand(job);

      case DEVICE_JOBS.RUN_SCENE:
        return await this.handleRunScene(job);

      case DEVICE_JOBS.SCENE_DEVICE_ACTIONS:
        return await this.handleSceneDeviceActions(job);

      case DEVICE_JOBS.CHECK_DEVICE_STATE_TRIGGERS:
        return await this.handleCheckDeviceStateTriggers(job);

      case DEVICE_JOBS.HARD_DELETE_DEVICE:
        return await this.handleHardDeleteDevice(job);

      default:
        this.logger.warn(`Unknown job name: ${job.name}`);
        return;
    }
  }

  @OnWorkerEvent('failed')
  onFailed(job: Job, error: Error) {
    this.logger.error(
      `[DLQ Alert] Job ${job?.name} failed after ${job?.attemptsMade} attempts: ${error?.message}`,
      { jobId: job?.id, data: job?.data },
    );
  }

  /**
   * Điều khiển 1 entity của device
   */
  private async handleControlCommand(job: Job): Promise<unknown> {
    const { token, entityCode, value, userId } =
      job.data as ControlCmdPayload;

    this.logger.log(
      `🚀 Executing control command: ${token} -> ${entityCode}:${String(value)}`,
    );

    const device = await this.databaseService.device.findUnique({
      where: { token },
      include: {
        partner: true,
        deviceModel: true,
        entities: true,
      },
    });

    if (!device) {
      this.logger.error(`Device ${token} not found`);
      return;
    }

    const entity = device.entities.find((e) => e.code === entityCode);
    if (!entity) {
      this.logger.error(
        `Entity ${entityCode} not found on device ${device.token}`,
      );
      return;
    }

    try {
      // ★ Cache userId for gateway to lookup when device responds
      if (userId) {
        const cacheKey = `cmd_user:${token}:${entityCode}`;
        await this.redisService.sadd(cacheKey, userId);
        await this.redisService.expire(cacheKey, 10);
      }

      const driver = this.integrationManager.getDriver(device.protocol);
      await driver.setValue(device, entity, value);

      this.logger.log(
        `✅ [${driver.name}] Command dispatched for ${device.token}`,
      );

      // Notify realtime UI
      this.redisService.publish(
        'socket:emit',
        JSON.stringify({
          room: `device_${device.token}`,
          event: 'COMMAND_SENT',
          data: {
            deviceId: device.id,
            entityCode,
            value,
            timestamp: new Date(),
            status: 'sent',
          },
        }),
      );

      return { success: true };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.logger.error(`❌ Failed to control device: ${message}`);

      this.redisService.publish(
        'socket:emit',
        JSON.stringify({
          room: `device_${device.token}`,
          event: 'COMMAND_ERROR',
          data: { deviceId: device.id, error: message },
        }),
      );

      throw error;
    }
  }

  /**
   * Điều khiển bulk nhiều entities cùng 1 device
   */
  private async handleControlDeviceValueCommand(job: Job): Promise<unknown> {
    const { token, entityPayloads, userId } =
      job.data as ControlDeviceValueCmdPayload;

    this.logger.log(
      `🚀 Executing control device value command: ${JSON.stringify(job.data)}`,
    );

    const device = await this.databaseService.device.findUnique({
      where: { token },
      include: {
        partner: true,
        deviceModel: true,
        entities: true,
      },
    });

    if (!device) {
      this.logger.error(`Device ${token} not found`);
      return;
    }

    try {
      // ★ Cache userId for all entities being controlled
      if (userId) {
        const cachePromises = entityPayloads.map((ep) => {
          const cacheKey = `cmd_user:${token}:${ep.entityCode}`;
          return this.redisService.sadd(cacheKey, userId).then(() =>
            this.redisService.expire(cacheKey, 10),
          );
        });
        await Promise.all(cachePromises);
      }

      const driver = this.integrationManager.getDriver(device.protocol);

      const entityCodes = new Set(entityPayloads.map((ep) => ep.entityCode));
      const entities = device.entities.filter((e) => entityCodes.has(e.code));

      const newEntities: DeviceEntity[] = entities
        .map((e) => {
          const ep = entityPayloads.find((p) => p.entityCode === e.code);
          if (!ep) return null;
          const numVal = Number(ep.value);
          if (!Number.isNaN(numVal)) {
            return { ...e, state: numVal, stateText: e.stateText };
          }
          return { ...e, stateText: String(ep.value) };
        })
        .filter((e): e is DeviceEntity => e !== null);

      await driver.setValueBulk(device, newEntities);

      this.logger.log(
        `✅ [${driver.name}] Command dispatched for ${device.token}`,
      );

      // Notify realtime UI
      this.redisService.publish(
        'socket:emit',
        JSON.stringify({
          room: `device_${device.token}`,
          event: 'COMMAND_SENT',
          data: {
            deviceId: device.id,
            values: entityPayloads.map((ep) => ({
              entityCode: ep.entityCode,
              value: ep.value,
            })),
            timestamp: new Date(),
            status: 'sent',
          },
        }),
      );

      return { success: true };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.logger.error(`❌ Failed to control device: ${message}`);

      this.redisService.publish(
        'socket:emit',
        JSON.stringify({
          room: `device_${device.token}`,
          event: 'COMMAND_ERROR',
          data: { deviceId: device.id, error: message },
        }),
      );

      throw error;
    }
  }

  /**
   * RUN_SCENE: Load scene, gộp actions theo deviceToken, đẩy job/device.
   */
  private async handleRunScene(
    job: Job,
  ): Promise<{ success: boolean; sceneId?: string; deviceCount?: number; actionCount?: number; error?: string }> {
    const { sceneId } = job.data as { sceneId: string };
    this.logger.log(`🎬 Scene ${sceneId}: grouping actions by device...`);

    const scene = await this.databaseService.scene.findUnique({
      where: { id: sceneId },
    });

    if (!scene) {
      this.logger.error(`Scene ${sceneId} not found`);
      return { success: false, error: 'Scene not found' };
    }

    if (!scene.active) {
      this.logger.warn(`Scene ${sceneId} is inactive, skip`);
      return { success: false, error: 'Scene is inactive' };
    }

    const actions = (scene.actions as unknown as SceneAction[]) ?? [];
    const byDevice = new Map<string, SceneDeviceAction[]>();
    for (const a of actions) {
      const list = byDevice.get(a.deviceToken) ?? [];
      list.push({ entityCode: a.entityCode, value: a.value });
      byDevice.set(a.deviceToken, list);
    }

    const deviceCount = byDevice.size;
    for (const [deviceToken, deviceActions] of byDevice) {
      await this.deviceQueue.add(
        DEVICE_JOBS.SCENE_DEVICE_ACTIONS,
        { deviceToken, actions: deviceActions } satisfies SceneDeviceActionsPayload,
        { priority: 2, attempts: 2, removeOnComplete: true },
      );
    }

    this.logger.log(
      `✅ Scene ${scene.name}: queued ${deviceCount} device job(s) for ${actions.length} action(s)`,
    );
    return {
      success: true,
      sceneId,
      deviceCount,
      actionCount: actions.length,
    };
  }

  /**
   * SCENE_DEVICE_ACTIONS: Thực thi gộp toàn bộ entity actions của 1 device.
   */
  private async handleSceneDeviceActions(
    job: Job,
  ): Promise<{ success: boolean; deviceToken?: string; entityCount?: number; skipped?: boolean; error?: string }> {
    const { deviceToken, actions } = job.data as SceneDeviceActionsPayload;

    const device = await this.databaseService.device.findUnique({
      where: { token: deviceToken },
      include: { partner: true, deviceModel: true, entities: true },
    });

    if (!device) {
      this.logger.error(`Scene device ${deviceToken} not found`);
      return { success: false, deviceToken, error: 'Device not found' };
    }

    const actionMap = new Map(actions.map((a) => [a.entityCode, a.value]));
    const newEntities: DeviceEntity[] = device.entities
      .filter((e) => actionMap.has(e.code))
      .map((e) => {
        const value = actionMap.get(e.code);
        if (value !== undefined && value !== null) {
          const numVal = Number(value);
          if (!Number.isNaN(numVal)) return { ...e, state: numVal, stateText: e.stateText };
        }
        return { ...e, stateText: value !== undefined ? String(value) : null };
      });

    if (newEntities.length === 0) {
      this.logger.warn(`Scene device ${deviceToken}: no valid actions`);
      return { success: true, deviceToken, skipped: true };
    }

    try {
      const driver = this.integrationManager.getDriver(device.protocol);
      await driver.setValueBulk(device, newEntities);
      this.logger.log(
        `✅ Scene device ${deviceToken}: ${newEntities.length} entity(ies)`,
      );

      // Notify realtime UI
      this.redisService.publish(
        'socket:emit',
        JSON.stringify({
          room: `device_${device.token}`,
          event: 'COMMAND_SENT',
          data: {
            deviceId: device.id,
            values: newEntities.map((e) => ({
              entityCode: e.code,
              value: e.state ?? e.stateText,
            })),
            timestamp: new Date(),
            status: 'sent',
          },
        }),
      );

      return {
        success: true,
        deviceToken,
        entityCount: newEntities.length,
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.logger.error(`❌ Scene device ${deviceToken}: ${message}`);

      this.redisService.publish(
        'socket:emit',
        JSON.stringify({
          room: `device_${device.token}`,
          event: 'COMMAND_ERROR',
          data: { deviceId: device.id, error: message },
        }),
      );

      throw error;
    }
  }

  /**
   * CHECK_DEVICE_STATE_TRIGGERS: Đánh giá scene triggers khi device state thay đổi.
   */
  private async handleCheckDeviceStateTriggers(job: Job): Promise<{ ok: boolean }> {
    const { deviceToken } = job.data as CheckDeviceStateTriggersPayload;

    const sceneIds = await this.sceneTriggerIndexService.getSceneIdsForDevice(deviceToken);
    
    if (sceneIds.length === 0) {
      return { ok: true };
    }

    const scenes = await this.databaseService.scene.findMany({
      where: { id: { in: sceneIds }, active: true },
      select: { id: true, name: true, triggers: true, minIntervalSeconds: true, lastFiredAt: true },
    });

    // Batch-resolve all deviceTokens → deviceIds upfront (eliminates N+1 queries)
    const allTokens = new Set<string>();
    for (const scene of scenes) {
      const triggers = Array.isArray(scene.triggers) ? (scene.triggers as Record<string, unknown>[]) : [];
      for (const trigger of triggers) {
        if (trigger?.['type'] !== SceneTriggerType.DEVICE_STATE) continue;
        const cfg = trigger['deviceStateConfig'] as { conditions?: ConditionConfig[] } | undefined;
        for (const c of cfg?.conditions ?? []) {
          if (c.deviceToken) allTokens.add(c.deviceToken);
        }
      }
    }

    const tokenMap = await this.resolveDeviceTokens([...allTokens]);

    for (const scene of scenes) {
      const triggers = Array.isArray(scene.triggers) ? (scene.triggers as Record<string, unknown>[]) : [];
      for (const trigger of triggers) {
        if (trigger?.['type'] !== SceneTriggerType.DEVICE_STATE) continue;

        const deviceStateConfig = trigger['deviceStateConfig'] as {
          conditionLogic: 'and' | 'or';
          conditions: ConditionConfig[];
        } | undefined;

        if (!deviceStateConfig?.conditions?.length) continue;

        const hasThisDevice = deviceStateConfig.conditions.some(
          (c) => c.deviceToken === deviceToken,
        );
        if (!hasThisDevice) continue;

        const logic = deviceStateConfig.conditionLogic;
        const conditions = deviceStateConfig.conditions;

        const match =
          logic === 'and'
            ? await this.evaluateConditionsAll(conditions, tokenMap)
            : await this.evaluateConditionsAny(conditions, tokenMap);

        if (match) {
          if (scene.minIntervalSeconds && scene.lastFiredAt) {
            const elapsed = (Date.now() - scene.lastFiredAt.getTime()) / 1000;
            if (elapsed < scene.minIntervalSeconds) {
              this.logger.debug(
                `[DEVICE_STATE] Scene "${scene.name}" skipped due to rate limit (${elapsed.toFixed(1)}s < ${scene.minIntervalSeconds}s)`,
              );
              break; // Skip other triggers for this scene too
            }
          }

          await this.deviceQueue.add(
            DEVICE_JOBS.RUN_SCENE,
            { sceneId: scene.id },
            { priority: 1, attempts: 1, removeOnComplete: true },
          );

          await this.databaseService.scene.update({
            where: { id: scene.id },
            data: { lastFiredAt: new Date() },
          });

          this.logger.log(
            `[DEVICE_STATE] Fired scene "${scene.name}" (${scene.id})`,
          );

          break; // Stop evaluating triggers since the scene has fired
        }
      }
    }
    return { ok: true };
  }

  /**
   * Batch-resolve deviceTokens → deviceIds in a single DB query.
   */
  private async resolveDeviceTokens(tokens: string[]): Promise<Map<string, string>> {
    if (tokens.length === 0) return new Map();
    const devices = await this.databaseService.device.findMany({
      where: { token: { in: tokens } },
      select: { id: true, token: true },
    });
    return new Map(devices.map((d) => [d.token, d.id]));
  }

  private async evaluateConditionsAll(conditions: ConditionConfig[], tokenMap: Map<string, string>): Promise<boolean> {
    for (const c of conditions) {
      if (!(await this.evaluateOneCondition(c, tokenMap))) return false;
    }
    return true;
  }

  private async evaluateConditionsAny(conditions: ConditionConfig[], tokenMap: Map<string, string>): Promise<boolean> {
    for (const c of conditions) {
      if (await this.evaluateOneCondition(c, tokenMap)) return true;
    }
    return false;
  }

  /**
   * Evaluate 1 condition: read entity state from Redis, compare with expected value.
   * Uses pre-resolved tokenMap to avoid per-condition DB lookups.
   */
  private async evaluateOneCondition(condition: ConditionConfig, tokenMap: Map<string, string>): Promise<boolean> {
    const deviceId = tokenMap.get(condition.deviceToken);
    if (!deviceId) return false;

    // Read entity state from Redis
    const raw = await this.redisService.get(
      `device:${deviceId}:entity:${condition.entityCode}`,
    );
    if (raw === null) return false;

    let entityState: EntityState;
    try {
      entityState = JSON.parse(raw) as EntityState;
    } catch {
      entityState = {};
    }

    // Get the value to compare: attribute or primary state
    let current: string | number | boolean | unknown =
      condition.attributeKey
        ? entityState[condition.attributeKey]
        : entityState.state;

    if (current === undefined || current === null) return false;

    // Normalize to number if it's a string representation of a number, skip booleans
    if (typeof current !== 'boolean') {
      const n = Number(current);
      current = Number.isNaN(n) ? current : n;
    }

    const op: CompareOperator = (condition.operator as CompareOperator) ?? 'eq';
    const expected = condition.value;

    switch (op) {
      case 'eq':
        return this.valuesEqual(current, expected);
      case 'ne':
        return !this.valuesEqual(current, expected);
      case 'gt':
        return Number(current) > Number(expected);
      case 'gte':
        return Number(current) >= Number(expected);
      case 'lt':
        return Number(current) < Number(expected);
      case 'lte':
        return Number(current) <= Number(expected);
      default:
        return this.valuesEqual(current, expected);
    }
  }

  private valuesEqual(a: unknown, b: unknown): boolean {
    if (a === b) return true;
    if (typeof a === 'number' && typeof b === 'number') return a === b;
    if (typeof a === 'string' && typeof b === 'string') return a === b;
    return String(a) === String(b);
  }

  /**
   * Hard-delete Device (cascade) + Redis cleanup.
   * Idempotent: safe to call even if device already deleted.
   */
  private async handleHardDeleteDevice(job: Job): Promise<{ success: boolean; skipped?: boolean; error?: string }> {
    const { deviceId, token } = job.data as { deviceId: string; token: string };
    this.logger.log(`🗑️ Hard-deleting device: ${deviceId} (token: ${token})`);

    try {
      const device = await this.databaseService.device.findFirst({
        where: { id: deviceId, unboundAt: { not: null } },
      });

      if (!device) {
        this.logger.warn(`Device ${deviceId} already deleted or not unbound, skipping.`);
        return { success: true, skipped: true };
      }

      await this.databaseService.device.delete({ where: { id: deviceId } });
      this.logger.log(`✅ Device ${deviceId} hard-deleted from DB`);

      // Redis cleanup
      await this.redisService.del(`status:${token}`).catch(() => undefined);
      await this.redisService.del(`device:shadow:${token}`).catch(() => undefined);

      const trackingKey = `device:${deviceId}:_ekeys`;
      const entityKeys = await this.redisService
        .smembers(trackingKey)
        .catch(() => [] as string[]);

      if (entityKeys.length > 0) {
        await this.redisService.del([...entityKeys, trackingKey]).catch(() => undefined);
      } else {
        await this.redisService.del(trackingKey).catch(() => undefined);
      }

      this.logger.log(`✅ Redis cleanup complete for ${token}`);
      return { success: true };
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      this.logger.error(`❌ Failed to hard-delete device ${deviceId}: ${message}`);
      return { success: false, error: message };
    }
  }
}
