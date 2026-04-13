import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { DatabaseService } from '@app/database';
import { RedisService } from '@app/redis-cache';
import { APP_BULLMQ_QUEUES, DEVICE_JOBS } from '@app/common';

interface ScheduleConfig {
  cron?: string;
  hour?: number;
  minute?: number;
  timezone?: string;
}

interface SceneTrigger {
  type: string;
  scheduleConfig?: ScheduleConfig;
}

interface SceneWithTriggers {
  id: string;
  name: string;
  triggers: unknown;
}

/**
 * Runs scene SCHEDULE triggers every minute.
 *
 * [SCENE SCALING — Bulk Enqueue Optimization]
 * Before: for await loop → N individual queue.add() calls → ~20s delay for 10k scenes.
 * After:
 *   1. Filter matching scenes in JS (no await per scene).
 *   2. Batch-check cooldowns via Redis pipeline (MGET → filter → pipelined SET NX).
 *   3. Single addBulk() call → all matched scenes enqueued in <200ms.
 */
@Injectable()
export class SceneScheduleCronService {
  private readonly logger = new Logger(SceneScheduleCronService.name);

  constructor(
    private readonly prisma: DatabaseService,
    private readonly redis: RedisService,
    @InjectQueue(APP_BULLMQ_QUEUES.DEVICE_CONTROL)
    private readonly deviceControlQueue: Queue,
  ) {}

  @Cron('* * * * *') // Every minute
  async checkScheduleTriggers(): Promise<void> {
    // Distributed lock — prevents duplicate fires across multiple worker instances
    const lock = await this.redis
      .getClient()
      .set('lock:scene_schedule', '1', 'EX', 55, 'NX');
    if (!lock) return;

    try {
      // Load all active SCHEDULE scenes in one query
      const scenes = (await this.prisma.$queryRaw`
        SELECT id, name, triggers
        FROM t_scene
        WHERE active = true
          AND triggers::text LIKE '%"type":"SCHEDULE"%'
      `) as SceneWithTriggers[];

      const now = new Date();
      const currentHour = now.getHours();
      const currentMinute = now.getMinutes();

      // Step 1: Filter matching scenes purely in JS — no await, no I/O
      const matchingScenes: SceneWithTriggers[] = [];
      for (const scene of scenes) {
        const triggers = Array.isArray(scene.triggers)
          ? (scene.triggers as SceneTrigger[])
          : [];
        const hasMatch = triggers.some(
          (t) =>
            t.type === 'SCHEDULE' &&
            t.scheduleConfig?.hour === currentHour &&
            t.scheduleConfig?.minute === currentMinute,
        );
        if (hasMatch) matchingScenes.push(scene);
      }

      if (matchingScenes.length === 0) return;

      // Step 2: Batch-check cooldowns — single Redis MGET round-trip
      const cooldownKeys = matchingScenes.map((s) => `scene_cooldown:${s.id}`);
      const client = this.redis.getClient();
      const existingCooldowns = await client.mget(...cooldownKeys);

      // Step 3: Filter out scenes already on cooldown, collect scenes to fire
      const toFire = matchingScenes.filter(
        (_, idx) => existingCooldowns[idx] === null,
      );
      if (toFire.length === 0) return;

      // Step 4: Batch-set cooldowns via pipeline (fire-and-forget, non-blocking)
      const pipeline = client.pipeline();
      for (const scene of toFire) {
        pipeline.set(`scene_cooldown:${scene.id}`, '1', 'EX', 60, 'NX');
      }
      pipeline.exec().catch(() => undefined); // non-blocking

      // Step 5: Single addBulk() — enqueue ALL matching scenes in 1 Redis round-trip
      const jobs = toFire.map((scene) => ({
        name: DEVICE_JOBS.RUN_SCENE,
        data: { sceneId: scene.id },
        opts: { priority: 1, attempts: 2, removeOnComplete: true },
      }));

      await this.deviceControlQueue.addBulk(jobs);

      this.logger.log(
        `[SCHEDULE] Bulk-enqueued ${toFire.length}/${matchingScenes.length} scenes ` +
          `(${scenes.length} total scanned) at ${currentHour}:${String(currentMinute).padStart(2, '0')}`,
      );
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.logger.error(`Scene schedule cron error: ${message}`);
    }
  }
}
