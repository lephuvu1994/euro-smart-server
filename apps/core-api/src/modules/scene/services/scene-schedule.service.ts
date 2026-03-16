import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
const cronParser = require('cron-parser');
import { DatabaseService } from '@app/database';
import { RedisService } from '@app/redis-cache';
import { SceneTriggerType } from '@app/common';
import { SceneService } from '../scene.service';

const SCENE_TRIGGER_LAST_KEY = 'scene_trigger_last';
const SCHEDULE_COOLDOWN_SEC = 55;
const ONE_MINUTE_MS = 60_000;

@Injectable()
export class SceneScheduleService {
    private readonly logger = new Logger(SceneScheduleService.name);

    constructor(
        private readonly databaseService: DatabaseService,
        private readonly redisService: RedisService,
        private readonly sceneService: SceneService
    ) {}

    /**
     * Mỗi phút: kiểm tra scene có trigger SCHEDULE (cron hoặc at time) và chạy nếu trùng.
     */
    @Cron('* * * * *')
    async checkScheduleTriggers(): Promise<void> {
        const scenes = await this.databaseService.scene.findMany({
            where: { active: true },
            select: { id: true, name: true, triggers: true },
        });

        const now = new Date();
        for (const scene of scenes) {
            const triggers = (scene.triggers as any[]) ?? [];
            for (let index = 0; index < triggers.length; index++) {
                const trigger = triggers[index];
                if (
                    trigger?.type !== SceneTriggerType.SCHEDULE ||
                    !trigger.scheduleConfig
                )
                    continue;
                const config = trigger.scheduleConfig as {
                    cron?: string;
                    hour?: number;
                    minute?: number;
                    timezone?: string;
                };
                const tz = config.timezone ?? 'UTC';
                if (config.cron) {
                    if (this.isCronMatchingThisMinute(config.cron, tz, now)) {
                        await this.tryFireScene(
                            scene.id,
                            scene.name,
                            index,
                            'cron'
                        );
                    }
                } else if (
                    config.hour !== undefined &&
                    config.minute !== undefined
                ) {
                    if (
                        this.isAtTimeMatching(
                            config.hour,
                            config.minute,
                            tz,
                            now
                        )
                    ) {
                        await this.tryFireScene(
                            scene.id,
                            scene.name,
                            index,
                            'at'
                        );
                    }
                }
            }
        }
    }

    private isCronMatchingThisMinute(
        cronExpr: string,
        timezone: string,
        now: Date
    ): boolean {
        try {
            const interval = cronParser.parseExpression(cronExpr, {
                currentDate: now,
                tz: timezone,
            });
            const next = interval.next();
            const diff = next.getTime() - now.getTime();
            return diff >= 0 && diff < ONE_MINUTE_MS;
        } catch {
            return false;
        }
    }

    private isAtTimeMatching(
        hour: number,
        minute: number,
        timezone: string,
        now: Date
    ): boolean {
        const parts = new Intl.DateTimeFormat('en-CA', {
            timeZone: timezone,
            hour: 'numeric',
            minute: 'numeric',
            hour12: false,
        }).formatToParts(now);
        const h = parseInt(
            parts.find(p => p.type === 'hour')?.value ?? '0',
            10
        );
        const m = parseInt(
            parts.find(p => p.type === 'minute')?.value ?? '0',
            10
        );
        return h === hour && m === minute;
    }

    private async tryFireScene(
        sceneId: string,
        sceneName: string,
        triggerIndex: number,
        kind: string
    ): Promise<void> {
        const key = `${SCENE_TRIGGER_LAST_KEY}:${sceneId}:${triggerIndex}`;
        const last = await this.redisService.get(key);
        const nowSec = Math.floor(Date.now() / 1000);
        if (last && nowSec - parseInt(last, 10) < SCHEDULE_COOLDOWN_SEC) return;

        await this.redisService.set(key, String(nowSec), SCHEDULE_COOLDOWN_SEC);
        await this.sceneService.runSceneByTrigger(sceneId);
        this.logger.log(
            `[SCHEDULE ${kind}] Fired scene "${sceneName}" (${sceneId})`
        );
    }
}
