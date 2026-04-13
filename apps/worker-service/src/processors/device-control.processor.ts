// src/modules/device/processors/device-control.processor.ts
// Single source of truth — worker-service is the ONLY consumer of DEVICE_CONTROL queue.
import { Processor, WorkerHost, OnWorkerEvent } from '@nestjs/bullmq';
import { InjectQueue } from '@nestjs/bullmq';
import { Job, Queue } from 'bullmq';
import { Logger } from '@nestjs/common';
import { APP_BULLMQ_QUEUES } from '@app/common';
import { RedisService } from '@app/redis-cache';
import {
  IntegrationManager,
  SceneTriggerType,
  DEVICE_JOBS,
  SceneTriggerIndexService,
} from '@app/common';
import { SocketEventPublisher } from '@app/common/events/socket-event.publisher';
import { DatabaseService } from '@app/database';
import { DeviceEntity } from '@prisma/client';
import { MqttGenericDriver } from '@app/common/integration/drivers/mqtt-generic.driver';

// ---------------------------------------------------------------------------
// Typed interfaces for job payloads (avoid `any`)
// ---------------------------------------------------------------------------

interface ControlCmdPayload {
  token: string;
  entityCode: string;
  value: string | number | boolean;
  userId?: string;
  source?: string;
  issuedAt?: number; // Unix ms timestamp — used for TTL expiry check
}

interface EntityPayload {
  entityCode: string;
  value: string | number | boolean;
}

interface ControlDeviceValueCmdPayload {
  token: string;
  entityPayloads: EntityPayload[];
  userId?: string;
  issuedAt?: number; // Unix ms timestamp — used for TTL expiry check
}

interface SceneAction {
  deviceToken: string;
  entityCode: string;
  value: string | number | boolean;
  delayMs?: number;
}

interface SceneDeviceAction {
  entityCode: string;
  value: string | number | boolean;
}

/**
 * [SCENE SCALING] Compiled action — pre-resolved at create/update time.
 * Contains ALL MQTT routing info so executor fires without any DB lookup.
 */
interface CompiledSceneAction {
  deviceToken: string;
  entityCode: string;
  value: string | number | boolean;
  delayMs?: number;
  protocol: string;
  commandKey: string | null;
  commandSuffix: string;
}

/**
 * Payload for SCENE_DEVICE_ACTIONS job (delayed actions).
 * All MQTT metadata is pre-embedded — NO DB lookup required in the handler.
 */
interface SceneDeviceActionsPayload {
  deviceToken: string;
  deviceId: string;
  protocol: string;
  /** Compiled actions with commandKey/commandSuffix resolved */
  compiledActions: Array<{
    entityCode: string;
    value: string | number | boolean;
    commandKey: string | null;
    commandSuffix: string;
  }>;
  sceneId: string;
  homeId: string;
}

interface CheckDeviceStateTriggersPayload {
  deviceToken: string;
  chainDepth?: number; // Anti-loop Layer 3: cross-scene chain depth counter
  updates?: {
    entityCode: string;
    state: string | number | boolean;
    attributes?: Record<string, unknown>[];
  }[];
}

// ---------------------------------------------------------------------------
// Anti-loop & performance constants
// ---------------------------------------------------------------------------

const SCENE_LOCK_TTL_S = 10; // minimum — dynamic TTL overrides for delay>0 scenes
const SCENE_CHAIN_TTL_S = 30;
const MAX_SCENE_CHAIN_DEPTH = 5;
/** Max actions executed inline (delay=0) per scene without creating sub-jobs.
 *  Prevents a single RUN_SCENE job from holding a worker slot > ~500ms. */
const INLINE_ACTION_CAP = 200;

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

@Processor(APP_BULLMQ_QUEUES.DEVICE_CONTROL, {
  concurrency: 20,
})
export class DeviceControlProcessor extends WorkerHost {
  private readonly logger = new Logger(DeviceControlProcessor.name);

  constructor(
    private readonly integrationManager: IntegrationManager,
    private readonly databaseService: DatabaseService,
    private readonly redisService: RedisService,
    private readonly sceneTriggerIndexService: SceneTriggerIndexService,
    private readonly socketPublisher: SocketEventPublisher,
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
    const { token, entityCode, value, userId, issuedAt } =
      job.data as ControlCmdPayload;

    // ★ TTL Guard: discard commands older than 10s to prevent stale replays
    const COMMAND_TTL_MS = 10_000;
    if (issuedAt && Date.now() - issuedAt > COMMAND_TTL_MS) {
      this.logger.warn(
        `[TTL] Skipped expired command: ${token} -> ${entityCode}:${String(value)} (age: ${Date.now() - issuedAt}ms)`,
      );
      return { skipped: true, reason: 'expired' };
    }

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
      // TTL = 120s to cover slow mechanical devices (curtain travel up to 120s).
      // Gateway clears this key after recording final-state history.
      if (userId) {
        const cacheKey = `cmd_user:${token}:${entityCode}`;
        await this.redisService.sadd(cacheKey, userId);
        await this.redisService.expire(cacheKey, 120);
      }

      const driver = this.integrationManager.getDriver(device.protocol);
      await driver.setValue(device, entity, value);

      this.logger.log(
        `✅ [${driver.name}] Command dispatched for ${device.token}`,
      );

      // Notify realtime UI (with retry)
      await this.socketPublisher.emitToDevice(device.token, 'COMMAND_SENT', {
        deviceId: device.id,
        entityCode,
        value,
        timestamp: new Date(),
        status: 'sent',
      });

      return { success: true };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.logger.error(`❌ Failed to control device: ${message}`);

      await this.socketPublisher.emitToDevice(device.token, 'COMMAND_ERROR', {
        deviceId: device.id,
        error: message,
      });

      throw error;
    }
  }

  /**
   * Điều khiển bulk nhiều entities cùng 1 device
   */
  private async handleControlDeviceValueCommand(job: Job): Promise<unknown> {
    const { token, entityPayloads, userId, issuedAt } =
      job.data as ControlDeviceValueCmdPayload;

    // ★ TTL Guard: discard commands older than 10s to prevent stale replays
    const COMMAND_TTL_MS = 10_000;
    if (issuedAt && Date.now() - issuedAt > COMMAND_TTL_MS) {
      this.logger.warn(
        `[TTL] Skipped expired bulk command: ${token} (age: ${Date.now() - issuedAt}ms)`,
      );
      return { skipped: true, reason: 'expired' };
    }

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
      // TTL = 120s to cover slow mechanical devices (curtain travel up to 120s).
      // Gateway clears this key after recording final-state history.
      if (userId) {
        const cachePromises = entityPayloads.map((ep) => {
          const cacheKey = `cmd_user:${token}:${ep.entityCode}`;
          return this.redisService
            .sadd(cacheKey, userId)
            .then(() => this.redisService.expire(cacheKey, 120));
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

      // Notify realtime UI (with retry)
      await this.socketPublisher.emitToDevice(device.token, 'COMMAND_SENT', {
        deviceId: device.id,
        values: entityPayloads.map((ep) => ({
          entityCode: ep.entityCode,
          value: ep.value,
        })),
        timestamp: new Date(),
        status: 'sent',
      });

      return { success: true };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.logger.error(`❌ Failed to control device: ${message}`);

      await this.socketPublisher.emitToDevice(device.token, 'COMMAND_ERROR', {
        deviceId: device.id,
        error: message,
      });

      throw error;
    }
  }

  /**
   * ═══════════════════════════════════════════════════════════════════════════
   * RUN_SCENE: Orchestrator — [SCENE SCALING v2]
   * ═══════════════════════════════════════════════════════════════════════════
   *
   * Strategy:
   * 1. Load scene (compiled actions embedded).
   * 2. Light DB query: device tokens → configVersion (NO entity join).
   * 3. Lazy re-compile if any device.configVersion > compiledAt (0.1% case).
   * 4. Dynamic lock TTL = max(10s, maxDelay + 15s) — delay up to 1h supported.
   * 5. Zero-delay actions (≤0ms): fired inline DIRECTLY via MQTT — no sub-job.
   * 6. Delayed actions (>0ms): enqueued as sub-jobs with compiled metadata.
   * 7. Batch socket emit: 1 SCENE_EXECUTED event instead of N COMMAND_SENT.
   */
  private async handleRunScene(job: Job): Promise<{
    success: boolean;
    sceneId?: string;
    deviceCount?: number;
    actionCount?: number;
    error?: string;
  }> {
    const { sceneId, chainDepth } = job.data as {
      sceneId: string;
      chainDepth?: number;
    };

    // ── Layer 3: Cross-scene chain depth guard ─────────────────────────
    if ((chainDepth ?? 0) >= MAX_SCENE_CHAIN_DEPTH) {
      this.logger.warn(
        `[ANTI-LOOP] Scene ${sceneId}: chain depth ${chainDepth} exceeds max ${MAX_SCENE_CHAIN_DEPTH}, rejecting`,
      );
      return { success: false, sceneId, error: 'chain_depth_exceeded' };
    }

    // ── Step 1: Load scene ──────────────────────────────────────────────────
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

    const rawActions = (scene.actions as unknown as SceneAction[]) ?? [];
    if (rawActions.length === 0) {
      return { success: true, sceneId, deviceCount: 0, actionCount: 0 };
    }

    // ── Step 2: Resolve compiled actions (Hybrid Compiled + Version Check) ──
    const deviceTokens = [...new Set(rawActions.map((a) => a.deviceToken))];

    // Light query: ONLY configVersion, no entity JOIN
    const deviceVersions = await this.databaseService.device.findMany({
      where: { token: { in: deviceTokens } },
      select: { id: true, token: true, protocol: true, configVersion: true },
    });
    const deviceVersionMap = new Map(deviceVersions.map((d) => [d.token, d]));

    // Parse compiled data — support both legacy array format and new { actions, versionSnapshot } format
    const compiledData = scene.compiledActions as unknown as
      | {
          actions?: CompiledSceneAction[];
          versionSnapshot?: Record<string, number>;
        }
      | CompiledSceneAction[]
      | null;

    let compiledActions: CompiledSceneAction[] | null = null;
    let versionSnapshot: Record<string, number> = {};

    if (Array.isArray(compiledData)) {
      // Legacy format (plain array) — force re-compile to upgrade
      compiledActions = compiledData;
    } else if (compiledData && 'actions' in compiledData) {
      compiledActions = compiledData.actions ?? null;
      versionSnapshot = compiledData.versionSnapshot ?? {};
    }

    // Check if any device was reconfigured after last compile
    const needsRecompile =
      !compiledActions ||
      !scene.compiledAt ||
      deviceVersions.some(
        (d) => d.configVersion > (versionSnapshot[d.token] ?? 0),
      );

    if (needsRecompile) {
      this.logger.log(
        `[COMPILE] Scene ${sceneId}: lazy re-compiling actions...`,
      );
      try {
        // Full entity fetch for re-compile
        const devicesWithEntities = await this.databaseService.device.findMany({
          where: { token: { in: deviceTokens } },
          select: {
            token: true,
            protocol: true,
            configVersion: true,
            entities: {
              select: { code: true, commandKey: true, commandSuffix: true },
            },
          },
        });
        const devMap = new Map(devicesWithEntities.map((d) => [d.token, d]));

        // Build new version snapshot
        const newSnapshot: Record<string, number> = {};
        for (const d of devicesWithEntities) {
          newSnapshot[d.token] = d.configVersion;
        }

        compiledActions = rawActions.map((action) => {
          const dev = devMap.get(action.deviceToken);
          const entity = dev?.entities.find(
            (e) => e.code === action.entityCode,
          );
          return {
            ...action,
            protocol: dev?.protocol ?? 'MQTT',
            commandKey: entity?.commandKey ?? null,
            commandSuffix: (entity?.commandSuffix ?? 'set').replace(/^\//, ''),
          };
        });

        // Persist re-compiled actions with snapshot (fire-and-forget)
        const compiledPayload = {
          actions: compiledActions,
          versionSnapshot: newSnapshot,
        };
        this.databaseService.scene
          .update({
            where: { id: sceneId },
            data: {
              compiledActions: compiledPayload as unknown as never,
              compiledAt: new Date(),
            },
          })
          .catch(() => undefined);
      } catch (err) {
        this.logger.error(
          `[COMPILE] Re-compile failed for scene ${sceneId}: ${err}`,
        );
        return { success: false, sceneId, error: 'compile_failed' };
      }
    }

    if (!compiledActions || compiledActions.length === 0) {
      return { success: true, sceneId, deviceCount: 0, actionCount: 0 };
    }

    // ── Step 3: Dynamic lock TTL ────────────────────────────────────────────
    // Lock TTL grows with max delay to prevent double-fire on long-delay scenes (e.g. 1-hour delay)
    const maxDelayMs = Math.max(
      0,
      ...compiledActions.map((a) => a.delayMs ?? 0),
    );
    const dynamicLockTtl = Math.max(
      SCENE_LOCK_TTL_S,
      Math.ceil(maxDelayMs / 1000) + 15,
    );
    const lockKey = `scene:lock:${sceneId}`;
    const acquired = await this.redisService.setnxWithTtl(
      lockKey,
      '1',
      dynamicLockTtl * 1000,
    );
    if (!acquired) {
      this.logger.warn(
        `[ANTI-LOOP] Scene ${sceneId}: already running (mutex), skip`,
      );
      return { success: false, sceneId, error: 'already_running' };
    }

    // ── Step 4: Write chain depth markers via pipeline ─────────────────────
    const nextDepth = (chainDepth ?? 0) + 1;
    const redis = this.redisService.getClient();
    const chainPipeline = redis.pipeline();
    for (const token of deviceTokens) {
      chainPipeline.set(
        `scene:chain:${token}`,
        String(nextDepth),
        'EX',
        SCENE_CHAIN_TTL_S,
      );
    }
    await chainPipeline.exec();

    // ── Step 5: Split into inline (delay=0) vs delayed (delay>0) ──────────
    const inlineActions: CompiledSceneAction[] = [];
    const delayedActions: CompiledSceneAction[] = [];
    let inlineCount = 0;
    for (const action of compiledActions) {
      if ((action.delayMs ?? 0) === 0 && inlineCount < INLINE_ACTION_CAP) {
        inlineActions.push(action);
        inlineCount++;
      } else {
        delayedActions.push(action);
      }
    }

    // ── Step 6: Inline execution — MQTT directly, NO sub-jobs ─────────────
    const inlineResults: Array<{
      token: string;
      entityCode: string;
      value: string | number | boolean;
    }> = [];
    if (inlineActions.length > 0) {
      const mqttDriver = this.integrationManager.getDriver(
        'MQTT',
      ) as MqttGenericDriver;
      // Group by (deviceToken, commandSuffix) to batch per topic
      const byGroup = new Map<string, CompiledSceneAction[]>();
      for (const action of inlineActions) {
        const key = `${action.deviceToken}::${action.commandSuffix}`;
        const group = byGroup.get(key) ?? [];
        group.push(action);
        byGroup.set(key, group);
      }
      for (const [, groupActions] of byGroup) {
        const first = groupActions[0];
        const topic = `device/${first.deviceToken}/${first.commandSuffix}`;
        const payload: Record<string, string | number | boolean> = {};
        for (const a of groupActions) {
          if (a.commandKey) payload[a.commandKey] = a.value;
        }
        let published = false;
        try {
          await mqttDriver.mqttService.publish(topic, JSON.stringify(payload), {
            qos: 1,
          });
          published = true;
        } catch (err) {
          this.logger.warn(`[INLINE] Failed to publish ${topic}: ${err}`);
        }
        if (published) {
          for (const a of groupActions) {
            inlineResults.push({
              token: a.deviceToken,
              entityCode: a.entityCode,
              value: a.value,
            });
          }
        }
      }
    }

    // ── Step 7: Enqueue delayed actions as sub-jobs ────────────────────────
    if (delayedActions.length > 0) {
      const byDeviceDelay = new Map<
        string,
        { token: string; delayMs: number; actions: CompiledSceneAction[] }
      >();
      for (const a of delayedActions) {
        const key = `${a.deviceToken}::${a.delayMs ?? 0}`;
        const group = byDeviceDelay.get(key) ?? {
          token: a.deviceToken,
          delayMs: a.delayMs ?? 0,
          actions: [],
        };
        group.actions.push(a);
        byDeviceDelay.set(key, group);
      }
      const jobs = [...byDeviceDelay.values()]
        .filter((g) => deviceVersionMap.has(g.token))
        .map((g) => ({
          name: DEVICE_JOBS.SCENE_DEVICE_ACTIONS,
          data: {
            deviceToken: g.token,
            deviceId: deviceVersionMap.get(g.token)!.id,
            protocol: deviceVersionMap.get(g.token)!.protocol,
            compiledActions: g.actions.map((a) => ({
              entityCode: a.entityCode,
              value: a.value,
              commandKey: a.commandKey,
              commandSuffix: a.commandSuffix,
            })),
            sceneId,
            homeId: scene.homeId,
          } satisfies SceneDeviceActionsPayload,
          opts: {
            priority: 2,
            attempts: 2,
            removeOnComplete: true,
            delay: g.delayMs,
          },
        }));
      if (jobs.length > 0) await this.deviceQueue.addBulk(jobs);
    }

    // ── Step 8: Batch socket emit — 1 event instead of N COMMAND_SENT ──────
    if (inlineResults.length > 0) {
      const byDevice = new Map<
        string,
        Array<{ entityCode: string; value: string | number | boolean }>
      >();
      for (const r of inlineResults) {
        const group = byDevice.get(r.token) ?? [];
        group.push({ entityCode: r.entityCode, value: r.value });
        byDevice.set(r.token, group);
      }
      this.socketPublisher
        .emitToHome(scene.homeId, 'SCENE_EXECUTED', {
          sceneId,
          sceneName: scene.name,
          devices: [...byDevice.entries()].map(([token, actions]) => ({
            token,
            actions,
          })),
          timestamp: new Date(),
          source: 'scene',
        })
        .catch(() => undefined);
    }

    const totalActions = compiledActions.length;
    this.logger.log(
      `✅ Scene "${scene.name}": ${inlineResults.length} inline + ${delayedActions.length} delayed action(s)`,
    );
    return {
      success: true,
      sceneId,
      deviceCount: deviceTokens.length,
      actionCount: totalActions,
    };
  }

  /**
   * SCENE_DEVICE_ACTIONS: Executes delayed scene actions.
   * [SCENE SCALING v2] — uses compiled metadata from payload, ZERO DB queries.
   */
  private async handleSceneDeviceActions(job: Job): Promise<{
    success: boolean;
    deviceToken?: string;
    entityCount?: number;
    skipped?: boolean;
    error?: string;
  }> {
    const {
      deviceToken,
      deviceId,
      protocol,
      compiledActions,
      sceneId,
      homeId,
    } = job.data as SceneDeviceActionsPayload;

    if (!compiledActions || compiledActions.length === 0) {
      return { success: true, deviceToken, skipped: true };
    }

    try {
      const mqttDriver = this.integrationManager.getDriver(
        protocol,
      ) as MqttGenericDriver;

      // Group by commandSuffix — publish 1 MQTT message per suffix
      const bySuffix = new Map<string, typeof compiledActions>();
      for (const a of compiledActions) {
        const group = bySuffix.get(a.commandSuffix) ?? [];
        group.push(a);
        bySuffix.set(a.commandSuffix, group);
      }

      for (const [suffix, actions] of bySuffix) {
        const topic = `device/${deviceToken}/${suffix}`;
        const payload: Record<string, string | number | boolean> = {};
        for (const a of actions) {
          if (a.commandKey) payload[a.commandKey] = a.value;
        }
        await mqttDriver.mqttService.publish(topic, JSON.stringify(payload), {
          qos: 1,
        });
      }

      this.logger.log(
        `✅ [DELAYED] Scene device ${deviceToken}: ${compiledActions.length} action(s)`,
      );

      // Notify UI for delayed actions
      await this.socketPublisher
        .emitToHome(homeId, 'SCENE_EXECUTED', {
          sceneId,
          devices: [
            {
              token: deviceToken,
              actions: compiledActions.map((a) => ({
                entityCode: a.entityCode,
                value: a.value,
              })),
            },
          ],
          timestamp: new Date(),
          source: 'scene_delayed',
        })
        .catch(() => undefined);

      return {
        success: true,
        deviceToken,
        entityCount: compiledActions.length,
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.logger.error(`❌ [DELAYED] Scene device ${deviceToken}: ${message}`);
      await this.socketPublisher
        .emitToHome(homeId, 'COMMAND_ERROR', { deviceToken, error: message })
        .catch(() => undefined);
      throw error;
    }
  }

  /**
   * CHECK_DEVICE_STATE_TRIGGERS: Evaluate scene triggers when device state changes.
   * Passes chainDepth to RUN_SCENE to prevent cross-scene loops (Layer 3).
   */
  private async handleCheckDeviceStateTriggers(
    job: Job,
  ): Promise<{ ok: boolean }> {
    const { deviceToken, chainDepth } =
      job.data as CheckDeviceStateTriggersPayload;

    const sceneIds =
      await this.sceneTriggerIndexService.getSceneIdsForDevice(deviceToken);

    if (sceneIds.length === 0) {
      return { ok: true };
    }

    const scenes = await this.databaseService.scene.findMany({
      where: { id: { in: sceneIds }, active: true },
      select: {
        id: true,
        name: true,
        triggers: true,
        minIntervalSeconds: true,
        lastFiredAt: true,
      },
    });

    // Batch-resolve all deviceTokens → deviceIds upfront (eliminates N+1 queries)
    const allTokens = new Set<string>();
    for (const scene of scenes) {
      const triggers = Array.isArray(scene.triggers)
        ? (scene.triggers as Record<string, unknown>[])
        : [];
      for (const trigger of triggers) {
        if (trigger?.['type'] !== SceneTriggerType.DEVICE_STATE) continue;
        const cfg = trigger['deviceStateConfig'] as
          | { conditions?: ConditionConfig[] }
          | undefined;
        for (const c of cfg?.conditions ?? []) {
          if (c.deviceToken) allTokens.add(c.deviceToken);
        }
      }
    }

    const tokenMap = await this.resolveDeviceTokens([...allTokens]);

    for (const scene of scenes) {
      const triggers = Array.isArray(scene.triggers)
        ? (scene.triggers as Record<string, unknown>[])
        : [];
      for (const trigger of triggers) {
        if (trigger?.['type'] !== SceneTriggerType.DEVICE_STATE) continue;

        const deviceStateConfig = trigger['deviceStateConfig'] as
          | {
              conditionLogic: 'and' | 'or';
              conditions: ConditionConfig[];
            }
          | undefined;

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
            { sceneId: scene.id, chainDepth: (chainDepth ?? 0) + 1 },
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
  private async resolveDeviceTokens(
    tokens: string[],
  ): Promise<Map<string, string>> {
    if (tokens.length === 0) return new Map();
    const devices = await this.databaseService.device.findMany({
      where: { token: { in: tokens } },
      select: { id: true, token: true },
    });
    return new Map(devices.map((d) => [d.token, d.id]));
  }

  private async evaluateConditionsAll(
    conditions: ConditionConfig[],
    tokenMap: Map<string, string>,
  ): Promise<boolean> {
    for (const c of conditions) {
      if (!(await this.evaluateOneCondition(c, tokenMap))) return false;
    }
    return true;
  }

  private async evaluateConditionsAny(
    conditions: ConditionConfig[],
    tokenMap: Map<string, string>,
  ): Promise<boolean> {
    for (const c of conditions) {
      if (await this.evaluateOneCondition(c, tokenMap)) return true;
    }
    return false;
  }

  /**
   * Evaluate 1 condition: read entity state from Redis, compare with expected value.
   * Uses pre-resolved tokenMap to avoid per-condition DB lookups.
   */
  private async evaluateOneCondition(
    condition: ConditionConfig,
    tokenMap: Map<string, string>,
  ): Promise<boolean> {
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
    let current: string | number | boolean | unknown = condition.attributeKey
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
  private async handleHardDeleteDevice(
    job: Job,
  ): Promise<{ success: boolean; skipped?: boolean; error?: string }> {
    const { deviceId, token } = job.data as { deviceId: string; token: string };
    this.logger.log(`🗑️ Hard-deleting device: ${deviceId} (token: ${token})`);

    try {
      const device = await this.databaseService.device.findFirst({
        where: { id: deviceId, unboundAt: { not: null } },
      });

      if (!device) {
        this.logger.warn(
          `Device ${deviceId} already deleted or not unbound, skipping.`,
        );
        return { success: true, skipped: true };
      }

      await this.databaseService.device.delete({ where: { id: deviceId } });
      this.logger.log(`✅ Device ${deviceId} hard-deleted from DB`);

      // Redis cleanup
      await this.redisService.del(`status:${token}`).catch(() => undefined);
      await this.redisService
        .del(`device:shadow:${token}`)
        .catch(() => undefined);

      const trackingKey = `device:${deviceId}:_ekeys`;
      const entityKeys = await this.redisService
        .smembers(trackingKey)
        .catch(() => [] as string[]);

      if (entityKeys.length > 0) {
        await this.redisService
          .del([...entityKeys, trackingKey])
          .catch(() => undefined);
      } else {
        await this.redisService.del(trackingKey).catch(() => undefined);
      }

      this.logger.log(`✅ Redis cleanup complete for ${token}`);
      return { success: true };
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      this.logger.error(
        `❌ Failed to hard-delete device ${deviceId}: ${message}`,
      );
      return { success: false, error: message };
    }
  }
}
