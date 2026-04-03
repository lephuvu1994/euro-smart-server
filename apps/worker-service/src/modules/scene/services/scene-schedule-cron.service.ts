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
 * Moved from core-api to worker-service to:
 *  1. Centralize all background processing in the worker
 *  2. Add distributed lock to prevent duplicate fires on horizontal scale
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
      // Only load scenes that have SCHEDULE triggers (text-based JSONB filter)
      const scenes = (await this.prisma.$queryRaw`
        SELECT id, name, triggers
        FROM t_scene
        WHERE active = true
          AND triggers::text LIKE '%"type":"SCHEDULE"%'
      `) as SceneWithTriggers[];

      const now = new Date();
      const currentHour = now.getHours();
      const currentMinute = now.getMinutes();

      for (const scene of scenes) {
        const triggers = Array.isArray(scene.triggers)
          ? (scene.triggers as SceneTrigger[])
          : [];

        for (const trigger of triggers) {
          if (trigger.type !== 'SCHEDULE' || !trigger.scheduleConfig) continue;
          await this.tryFireScene(scene, trigger.scheduleConfig, currentHour, currentMinute);
        }
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.logger.error(`Scene schedule cron error: ${message}`);
    }
  }

  private async tryFireScene(
    scene: SceneWithTriggers,
    config: ScheduleConfig,
    currentHour: number,
    currentMinute: number,
  ): Promise<void> {
    const targetHour = config.hour ?? -1;
    const targetMinute = config.minute ?? -1;

    if (targetHour !== currentHour || targetMinute !== currentMinute) return;

    // Redis cooldown — prevents duplicate fires within the same minute
    const cooldownKey = `scene_cooldown:${scene.id}`;
    const alreadyFired = await this.redis.getClient().set(
      cooldownKey,
      '1',
      'EX',
      60, // 1 minute TTL
      'NX',
    );
    if (!alreadyFired) return;

    await this.deviceControlQueue.add(
      DEVICE_JOBS.RUN_SCENE,
      { sceneId: scene.id },
      { priority: 1, attempts: 2, removeOnComplete: true },
    );

    this.logger.log(`[SCHEDULE] Fired scene "${scene.name}" (${scene.id})`);
  }
}
