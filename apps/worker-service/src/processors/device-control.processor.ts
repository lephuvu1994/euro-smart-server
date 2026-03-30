// src/modules/device/processors/device-control.processor.ts
import { Processor, WorkerHost } from '@nestjs/bullmq';
import { InjectQueue } from '@nestjs/bullmq';
import { Job, Queue } from 'bullmq';
import { Logger } from '@nestjs/common';
import { APP_BULLMQ_QUEUES } from '@app/common';
import { RedisService } from '@app/redis-cache';
import { IntegrationManager, SceneTriggerType, DEVICE_JOBS } from '@app/common';
import { DatabaseService } from '@app/database';

@Processor(APP_BULLMQ_QUEUES.DEVICE_CONTROL)
export class DeviceControlProcessor extends WorkerHost {
  private readonly logger = new Logger(DeviceControlProcessor.name);

  constructor(
    private readonly integrationManager: IntegrationManager,
    private readonly databaseService: DatabaseService,
    private readonly redisService: RedisService,
    @InjectQueue(APP_BULLMQ_QUEUES.DEVICE_CONTROL)
    private readonly deviceQueue: Queue,
  ) {
    super();
  }

  async process(job: Job): Promise<any> {
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

  /**
   * Điều khiển 1 entity của device
   */
  private async handleControlCommand(job: Job): Promise<any> {
    const { token, entityCode, value } = job.data;

    this.logger.log(
      `🚀 Executing control command: ${token} -> ${entityCode}:${value}`,
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
      const driver = this.integrationManager.getDriver(device.protocol);
      await driver.setValue(device, entity, value);

      this.logger.log(
        `✅ [${driver.name}] Command dispatched for ${device.token}`,
      );
      return { success: true };
    } catch (error) {
      this.logger.error(`❌ Failed to control device: ${error.message}`);

      throw error;
    }
  }

  /**
   * Điều khiển bulk nhiều entities cùng 1 device
   */
  private async handleControlDeviceValueCommand(job: Job): Promise<any> {
    const { token, entityPayloads } = job.data;

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
      const driver = this.integrationManager.getDriver(device.protocol);

      const entities = device.entities.filter((e) =>
        entityPayloads.some((ep: any) => ep.entityCode === e.code),
      );
      const newEntities = entities
        .map((e) => {
          const ep = entityPayloads.find((ep: any) => ep.entityCode === e.code);
          if (!ep) return null;
          const value = ep.value;
          if (value !== undefined && !isNaN(Number(value))) {
            return { ...e, state: Number(value) };
          }
          return { ...e, stateText: String(value) };
        })
        .filter(Boolean);

      await driver.setValueBulk(device, newEntities);

      this.logger.log(
        `✅ [${driver.name}] Command dispatched for ${device.token}`,
      );
      return { success: true };
    } catch (error) {
      this.logger.error(`❌ Failed to control device: ${error.message}`);

      throw error;
    }
  }

  /**
   * RUN_SCENE: Load scene, gộp actions theo deviceToken, đẩy job/device.
   */
  private async handleRunScene(job: Job): Promise<any> {
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

    // Scene actions now use entityCode instead of featureCode
    const actions =
      (scene.actions as {
        deviceToken: string;
        entityCode: string;
        value: any;
      }[]) || [];
    const byDevice = new Map<string, { entityCode: string; value: any }[]>();
    for (const a of actions) {
      const list = byDevice.get(a.deviceToken) ?? [];
      list.push({ entityCode: a.entityCode, value: a.value });
      byDevice.set(a.deviceToken, list);
    }

    const deviceCount = byDevice.size;
    for (const [deviceToken, deviceActions] of byDevice) {
      await this.deviceQueue.add(
        DEVICE_JOBS.SCENE_DEVICE_ACTIONS,
        { deviceToken, actions: deviceActions },
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
  private async handleSceneDeviceActions(job: Job): Promise<any> {
    const { deviceToken, actions } = job.data as {
      deviceToken: string;
      actions: { entityCode: string; value: any }[];
    };

    const device = await this.databaseService.device.findUnique({
      where: { token: deviceToken },
      include: { partner: true, deviceModel: true, entities: true },
    });

    if (!device) {
      this.logger.error(`Scene device ${deviceToken} not found`);
      return { success: false, deviceToken, error: 'Device not found' };
    }

    const entities = device.entities.filter((e) =>
      actions.some((a) => a.entityCode === e.code),
    );
    const newEntities = entities
      .map((e) => {
        const act = actions.find((a) => a.entityCode === e.code);
        if (!act) return null;
        const value = act.value;
        if (value !== undefined && value !== null && !isNaN(Number(value))) {
          return { ...e, state: Number(value) };
        }
        return { ...e, stateText: value };
      })
      .filter(Boolean) as any[];

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
      return {
        success: true,
        deviceToken,
        entityCount: newEntities.length,
      };
    } catch (err: any) {
      this.logger.error(`❌ Scene device ${deviceToken}: ${err?.message}`);
      throw err;
    }
  }

  /**
   * CHECK_DEVICE_STATE_TRIGGERS: Đánh giá scene triggers khi device state thay đổi.
   * Now uses entityCode instead of featureCode.
   */
  private async handleCheckDeviceStateTriggers(job: Job): Promise<any> {
    const { deviceToken } = job.data as {
      deviceToken: string;
      updates: { entityCode: string; state: any; attributes?: any[] }[];
    };

    const scenes = await this.databaseService.scene.findMany({
      where: { active: true },
      select: { id: true, name: true, triggers: true },
    });

    for (const scene of scenes) {
      const triggers = (scene.triggers as any[]) ?? [];
      for (const trigger of triggers) {
        if (
          trigger?.type !== SceneTriggerType.DEVICE_STATE ||
          !trigger.deviceStateConfig?.conditions?.length
        )
          continue;
        const hasThisDevice = trigger.deviceStateConfig.conditions.some(
          (c: any) => c.deviceToken === deviceToken,
        );
        if (!hasThisDevice) continue;

        const logic = trigger.deviceStateConfig.conditionLogic as 'and' | 'or';
        const conditions = trigger.deviceStateConfig.conditions as Array<{
          deviceToken: string;
          entityCode: string;
          attributeKey?: string;
          value?: any;
          operator?: string;
        }>;

        let match = false;
        if (logic === 'and') {
          match = await this.evaluateConditionsAll(conditions);
        } else {
          match = await this.evaluateConditionsAny(conditions);
        }
        if (match) {
          await this.deviceQueue.add(
            DEVICE_JOBS.RUN_SCENE,
            { sceneId: scene.id },
            { priority: 1, attempts: 1, removeOnComplete: true },
          );
          this.logger.log(
            `[DEVICE_STATE] Fired scene "${scene.name}" (${scene.id})`,
          );
        }
      }
    }
    return { ok: true };
  }

  private async evaluateConditionsAll(
    conditions: Array<{
      deviceToken: string;
      entityCode: string;
      attributeKey?: string;
      value?: any;
      operator?: string;
    }>,
  ): Promise<boolean> {
    for (const c of conditions) {
      const ok = await this.evaluateOneCondition(c);
      if (!ok) return false;
    }
    return true;
  }

  private async evaluateConditionsAny(
    conditions: Array<{
      deviceToken: string;
      entityCode: string;
      attributeKey?: string;
      value?: any;
      operator?: string;
    }>,
  ): Promise<boolean> {
    for (const c of conditions) {
      const ok = await this.evaluateOneCondition(c);
      if (ok) return true;
    }
    return false;
  }

  /**
   * Evaluate 1 condition: read entity state from Redis, compare with expected value.
   * Supports both entity primary state and specific attribute values.
   */
  private async evaluateOneCondition(condition: {
    deviceToken: string;
    entityCode: string;
    attributeKey?: string;
    value?: any;
    operator?: string;
  }): Promise<boolean> {
    const device = await this.databaseService.device.findUnique({
      where: { token: condition.deviceToken },
      select: { id: true },
    });
    if (!device) return false;

    // Read entity state from Redis
    const raw = await this.redisService.get(
      `device:${device.id}:entity:${condition.entityCode}`,
    );
    if (raw === null) return false;

    let entityState: any;
    try {
      entityState = JSON.parse(raw);
    } catch {
      entityState = {};
    }

    // Get the value to compare: attribute or primary state
    let current: any;
    if (condition.attributeKey) {
      current = entityState[condition.attributeKey];
    } else {
      current = entityState.state;
    }

    if (current === undefined || current === null) return false;

    // Normalize to number if both sides are numeric
    const n = Number(current);
    current = Number.isNaN(n) ? current : n;

    const op = condition.operator ?? 'eq';
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

  private valuesEqual(a: any, b: any): boolean {
    if (a === b) return true;
    if (typeof a === 'number' && typeof b === 'number') return a === b;
    if (typeof a === 'string' && typeof b === 'string') return a === b;
    return String(a) === String(b);
  }

  /**
   * Hard-delete Device (cascade) + Redis cleanup.
   * Called by iot-gateway after it sends unbind command to chip.
   * Idempotent: safe to call even if device already deleted.
   */
  private async handleHardDeleteDevice(job: Job): Promise<any> {
    const { deviceId, token } = job.data;
    this.logger.log(`🗑️ Hard-deleting device: ${deviceId} (token: ${token})`);

    try {
      // 1. Hard delete Device (cascade: Entity, Attribute, History, Share)
      const device = await this.databaseService.device.findFirst({
        where: { id: deviceId, unboundAt: { not: null } },
      });

      if (!device) {
        this.logger.warn(`Device ${deviceId} already deleted or not unbound, skipping.`);
        return { success: true, skipped: true };
      }

      await this.databaseService.device.delete({ where: { id: deviceId } });
      this.logger.log(`✅ Device ${deviceId} hard-deleted from DB`);

      // 2. Redis cleanup
      await this.redisService.del(`status:${token}`).catch(() => undefined);
      await this.redisService.del(`device:shadow:${token}`).catch(() => undefined);

      const trackingKey = `device:${deviceId}:_ekeys`;
      const entityKeys = await this.redisService.smembers(trackingKey).catch(() => [] as string[]);
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
