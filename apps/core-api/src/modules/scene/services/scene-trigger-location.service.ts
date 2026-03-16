import { Injectable, Logger } from '@nestjs/common';
import { DatabaseService } from '@app/database';
import { RedisService } from '@app/redis-cache';
import {
    LocationTriggerEvent,
    SceneTriggerType,
} from '../dtos/request/scene-trigger.dto';
import { SceneService } from '../scene.service';

const USER_HOME_STATE_KEY = 'scene:location:user_home_state';
const RADIUS_EARTH_M = 6_371_000;

@Injectable()
export class SceneTriggerLocationService {
    private readonly logger = new Logger(SceneTriggerLocationService.name);

    constructor(
        private readonly databaseService: DatabaseService,
        private readonly redisService: RedisService,
        private readonly sceneService: SceneService
    ) {}

    /**
     * App gửi vị trí user (sau mỗi lần cập nhật GPS).
     * So khớp với Home (geofence) và scene có trigger LOCATION (enter/leave).
     */
    async onLocationReport(
        userId: string,
        latitude: number,
        longitude: number
    ): Promise<void> {
        const homes = await this.databaseService.home.findMany({
            where: {
                OR: [{ ownerId: userId }, { members: { some: { userId } } }],
                latitude: { not: null },
                longitude: { not: null },
                radius: { not: null },
            },
            select: {
                id: true,
                name: true,
                latitude: true,
                longitude: true,
                radius: true,
            },
        });

        for (const home of homes) {
            const lat = home.latitude!;
            const lng = home.longitude!;
            const radiusM = home.radius ?? 100;
            const inCircle = this.isInsideGeofence(
                latitude,
                longitude,
                lat,
                lng,
                radiusM
            );
            const key = `${USER_HOME_STATE_KEY}:${userId}:${home.id}`;
            const prevRaw = await this.redisService.get(key);
            const prev = prevRaw === 'in' ? 'in' : 'out';

            await this.redisService.set(key, inCircle ? 'in' : 'out', 86400);

            let event: LocationTriggerEvent | null = null;
            if (prev === 'out' && inCircle) event = LocationTriggerEvent.ENTER;
            if (prev === 'in' && !inCircle) event = LocationTriggerEvent.LEAVE;
            if (!event) continue;

            const scenes = await this.databaseService.scene.findMany({
                where: {
                    homeId: home.id,
                    active: true,
                },
                select: { id: true, name: true, triggers: true },
            });

            for (const scene of scenes) {
                const triggers = (scene.triggers as any[]) ?? [];
                for (const trigger of triggers) {
                    if (
                        trigger?.type !== SceneTriggerType.LOCATION ||
                        !trigger.locationConfig
                    )
                        continue;
                    const config = trigger.locationConfig as {
                        event: string;
                        userId?: string;
                    };
                    const triggerUserId = config.userId ?? userId;
                    if (triggerUserId !== userId) continue;
                    if (config.event !== event) continue;
                    await this.sceneService.runSceneByTrigger(scene.id);
                    this.logger.log(
                        `[LOCATION ${event}] Fired scene "${scene.name}" (${scene.id}) for user ${userId}`
                    );
                }
            }
        }
    }

    private isInsideGeofence(
        userLat: number,
        userLng: number,
        centerLat: number,
        centerLng: number,
        radiusMeters: number
    ): boolean {
        const d = this.haversineMeters(userLat, userLng, centerLat, centerLng);
        return d <= radiusMeters;
    }

    private haversineMeters(
        lat1: number,
        lon1: number,
        lat2: number,
        lon2: number
    ): number {
        const toRad = (x: number) => (x * Math.PI) / 180;
        const dLat = toRad(lat2 - lat1);
        const dLon = toRad(lon2 - lon1);
        const a =
            Math.sin(dLat / 2) ** 2 +
            Math.cos(toRad(lat1)) *
                Math.cos(toRad(lat2)) *
                Math.sin(dLon / 2) ** 2;
        const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
        return RADIUS_EARTH_M * c;
    }
}
