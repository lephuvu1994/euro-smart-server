import { Injectable, Logger } from '@nestjs/common';
import { RedisService } from '@app/redis-cache';
import { Queue } from 'bullmq';
import { isEqual } from 'lodash';
import { InjectQueue } from '@nestjs/bullmq';
import {
  APP_BULLMQ_QUEUES,
  EDeviceAlertEvent,
} from '@app/common/enums/app.enum';
import { DEVICE_JOBS } from '@app/common/enums/device-job.enum';
import { isTransientState } from '@app/common';
import { DatabaseService } from '@app/database';

@Injectable()
export class DeviceStateService {
  private readonly logger = new Logger(DeviceStateService.name);

  constructor(
    private readonly databaseService: DatabaseService,
    private redisService: RedisService,
    @InjectQueue(APP_BULLMQ_QUEUES.DEVICE_STATUS)
    private statusQueue: Queue,
    @InjectQueue(APP_BULLMQ_QUEUES.DEVICE_CONTROL)
    private deviceControlQueue: Queue,
    @InjectQueue(APP_BULLMQ_QUEUES.PUSH_NOTIFICATION)
    private notificationQueue: Queue,
  ) {}

  /**
   * [ENTITY-BASED] Xử lý phản hồi trạng thái từ thiết bị.
   * Map JSON payload keys → DeviceEntity (via commandKey) + EntityAttribute (via attr config).
   */
  public async processState(token: string, rawData: Record<string, unknown>) {
    try {
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
        this.getCachedDevice(token),
      ]);

      if (!device || !device.entities) return;

      const allTargetUserIds = new Set<string>();
      allTargetUserIds.add(device.ownerId);
      if (device.sharedUsers) {
        device.sharedUsers.forEach((s) => allTargetUserIds.add(s.userId));
      }
      if (device.home?.members) {
        device.home.members.forEach((m) => allTargetUserIds.add(m.userId));
      }

      const updates: Array<{
        entityId: string;
        entityCode: string;
        state?: number | string | boolean;
        attributes?: Array<{ key: string; value: number | string | boolean }>;
      }> = [];

      // Collect all entity Redis keys to batch-read old states
      const entityKeyMap = new Map<
        string,
        { entity: (typeof device.entities)[0]; update: (typeof updates)[0] }
      >();

      // 3. ENTITY MAPPING — pure synchronous computation
      for (const entity of device.entities) {
        let entityUpdated = false;
        const entityUpdate: (typeof updates)[0] = {
          entityId: entity.id,
          entityCode: entity.code,
        };

        // Case A: Primary state
        if (entity.commandKey && rawData[entity.commandKey] !== undefined) {
          entityUpdate.state = rawData[entity.commandKey] as string | number | boolean;
          entityUpdated = true;
        }

        // Case B: Attributes
        const attrUpdates: Array<{
          key: string;
          value: number | string | boolean;
        }> = [];
        for (const attr of entity.attributes) {
          const attrConfig = attr.config as { commandKey?: string } | null;
          const configKey = attrConfig?.commandKey ?? attr.key;
          if (rawData[configKey] !== undefined) {
            attrUpdates.push({ key: attr.key, value: rawData[configKey] as string | number | boolean });
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
        if (
          entityUpdate.state !== undefined &&
          !isEqual(entityUpdate.state, oldState.state)
        ) {
          const isNumber = typeof entityUpdate.state === 'number';
          const isString = typeof entityUpdate.state === 'string';

          if (isNumber || isString) {
            const stateLabel = String(entityUpdate.state);

            // Deduplicate: Acquiring a short-lived lock prevents duplicate notifications when multiple
            // concurrent messages are received for the exact same state (e.g. status + telemetry)
            const lockKey = `lock:state_change:${device.id}:${entity.code}:${stateLabel}`;
            const acquired = await this.redisService.setnxWithTtl(
              lockKey,
              '1',
              2000,
            );

            if (acquired) {
              // ★ Lookup who initiated this command (Redis ephemeral cache)
              const cmdUserKey = `cmd_user:${token}:${entity.code}`;
              const actionUserIds =
                await this.redisService.smembers(cmdUserKey);
              if (actionUserIds.length > 0) {
                await this.redisService.del(cmdUserKey);
              }
              const source =
                actionUserIds.length > 0 ? 'app' : rawData.source || 'device';

              // ★ Lookup user name for notification body (only when app-initiated)
              let actionUserName: string | null = null;
              if (actionUserIds.length > 0) {
                const actionUser = await this.databaseService.user.findUnique({
                  where: { id: actionUserIds[0] },
                  select: { firstName: true, lastName: true },
                });
                if (actionUser) {
                  actionUserName =
                    [actionUser.lastName, actionUser.firstName]
                      .filter(Boolean)
                      .join(' ') || null;
                }
              }

              // Skip history and push notifications for intermediate/transient states
              // (e.g. OPENING, CLOSING for curtain devices, UNLOCKING for locks).
              const isIntermediateState = isTransientState(
                entity.domain,
                stateLabel,
              );

              if (!isIntermediateState) {
                // Record state history with action author
                writePromises.push(
                  this.statusQueue.add(
                    DEVICE_JOBS.RECORD_STATE_HISTORY,
                    {
                      entityId: entity.id,
                      value: isNumber ? entityUpdate.state : null,
                      valueText: isString ? stateLabel : null,
                      source,
                      actionUserId: actionUserIds[0] || null,
                    },
                    { removeOnComplete: true, attempts: 2 },
                  ),
                );
              }

              // ★ Notification token pre-flight logic
              const notifyUserIds = new Set(allTargetUserIds);
              for (const uid of actionUserIds) notifyUserIds.delete(uid);

              let shouldNotify = false;
              if (notifyUserIds.size > 0 && !isIntermediateState) {
                const activeSession =
                  await this.databaseService.session.findFirst({
                    where: {
                      userId: { in: Array.from(notifyUserIds) },
                      pushToken: { not: null },
                    },
                    select: { id: true },
                  });
                shouldNotify = !!activeSession;
              }

              if (shouldNotify) {
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
                          source,
                          actionUserName: actionUserName ?? 'Nút bấm',
                          excludeUserIds:
                            actionUserIds.length > 0
                              ? actionUserIds
                              : undefined,
                        },
                      },
                    },
                    { removeOnComplete: true, attempts: 1 },
                  ),
                );
              }
            } // end if acquired
          }
        }

        updates.push(entityUpdate);
      }

      // 5. Trigger scene evaluation — skip if this state update was caused by a scene action
      // (Anti-loop Layer 1b: if scene:origin marker exists, queuing CHECK_DEVICE_STATE_TRIGGERS
      // would re-evaluate the same scene that just ran → infinite loop).
      if (updates.length > 0) {
        const sceneOriginKey = `scene:origin:${token}`;
        const isSceneOrigin = await this.redisService.get(sceneOriginKey);

        if (isSceneOrigin) {
          this.logger.debug(
            `[ANTI-LOOP] Skipping scene trigger check for ${token} (originated from scene ${isSceneOrigin})`,
          );
        } else {
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
      }


      await Promise.all(writePromises);
    } catch (e) {
      this.logger.error(
        `Error processing state message for ${token}: ${e.message}`,
      );
    }
  }

  /**
   * Cache-aside pattern for device metadata (entities, sharedUsers, homeMembers).
   * TTL = 5 minutes — adequate for IoT realtime because device config changes rarely.
   * State is ALWAYS read from Redis shadow, never from this cache.
   */
  private async getCachedDevice(token: string) {
    const cacheKey = `device:meta:${token}`;
    const cached = await this.redisService.get(cacheKey);
    if (cached) {
      try {
        return JSON.parse(cached) as Awaited<ReturnType<typeof this.fetchDevice>>;
      } catch {
        // corrupt cache — fall through to DB
      }
    }

    const device = await this.fetchDevice(token);
    if (device) {
      // Fire-and-forget cache write (don't block state processing)
      void this.redisService.set(cacheKey, JSON.stringify(device), 300);
    }
    return device;
  }

  private fetchDevice(token: string) {
    return this.databaseService.device.findUnique({
      where: { token },
      include: {
        entities: { include: { attributes: true } },
        sharedUsers: { select: { userId: true } },
        home: {
          select: {
            members: { select: { userId: true } },
          },
        },
      },
    });
  }
}
