import { HttpStatus, Injectable, HttpException } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { DatabaseService } from '@app/database';
import { APP_BULLMQ_QUEUES } from '@app/common';
import { DEVICE_JOBS } from '@app/common';
import { CreateSceneDto, UpdateSceneDto } from './dtos/request';
import { SceneResponseDto } from './dtos/response/scene.response';

/**
 * Scene (Gladys / Home Assistant style):
 * 1. Manual: triggers = [] → chỉ chạy qua POST :sceneId/run.
 * 2. Automation: có trigger(s) → executor đã implement:
 *    - SCHEDULE: SceneScheduleService @Cron mỗi phút, so khớp cron/at time + timezone → runSceneByTrigger.
 *    - LOCATION: POST /scenes/triggers/location (lat/lng) → SceneTriggerLocationService so khớp home geofence enter/leave → runSceneByTrigger.
 *    - DEVICE_STATE: MQTT state/status → job CHECK_DEVICE_STATE_TRIGGERS → DeviceControlProcessor evaluate conditions (Redis) and/or → runSceneByTrigger.
 */
@Injectable()
export class SceneService {
    constructor(
        private readonly databaseService: DatabaseService,
        @InjectQueue(APP_BULLMQ_QUEUES.DEVICE_CONTROL)
        private readonly deviceQueue: Queue
    ) {}

    private async ensureUserCanAccessHome(
        userId: string,
        homeId: string
    ): Promise<void> {
        const home = await this.databaseService.home.findFirst({
            where: {
                id: homeId,
                OR: [{ ownerId: userId }, { members: { some: { userId } } }],
            },
        });
        if (!home) {
            throw new HttpException(
                'scene.error.homeNotFoundOrNoAccess',
                HttpStatus.FORBIDDEN
            );
        }
    }

    private async ensureUserCanAccessScene(
        userId: string,
        sceneId: string
    ): Promise<void> {
        const scene = await this.databaseService.scene.findFirst({
            where: {
                id: sceneId,
                home: {
                    OR: [
                        { ownerId: userId },
                        { members: { some: { userId } } },
                    ],
                },
            },
        });
        if (!scene) {
            throw new HttpException(
                'scene.error.sceneNotFoundOrNoAccess',
                HttpStatus.FORBIDDEN
            );
        }
    }

    async getScenesByHome(
        homeId: string,
        userId: string
    ): Promise<SceneResponseDto[]> {
        await this.ensureUserCanAccessHome(userId, homeId);
        const scenes = await this.databaseService.scene.findMany({
            where: { homeId },
            orderBy: { createdAt: 'desc' },
        });
        return scenes.map(s => ({
            id: s.id,
            name: s.name,
            active: s.active,
            triggers: (s.triggers as any[]) ?? [],
            actions: (s.actions as any[]) ?? [],
            homeId: s.homeId,
            createdAt: s.createdAt,
            updatedAt: s.updatedAt,
        })) as SceneResponseDto[];
    }

    async getScene(sceneId: string, userId: string): Promise<SceneResponseDto> {
        await this.ensureUserCanAccessScene(userId, sceneId);
        const scene = await this.databaseService.scene.findUnique({
            where: { id: sceneId },
        });
        if (!scene) {
            throw new HttpException(
                'scene.error.sceneNotFound',
                HttpStatus.NOT_FOUND
            );
        }
        return {
            id: scene.id,
            name: scene.name,
            active: scene.active,
            triggers: (scene.triggers as any[]) ?? [],
            actions: (scene.actions as any[]) ?? [],
            homeId: scene.homeId,
            createdAt: scene.createdAt,
            updatedAt: scene.updatedAt,
        } as SceneResponseDto;
    }

    async createScene(
        homeId: string,
        userId: string,
        dto: CreateSceneDto
    ): Promise<SceneResponseDto> {
        await this.ensureUserCanAccessHome(userId, homeId);
        const scene = await this.databaseService.scene.create({
            data: {
                homeId,
                name: dto.name,
                active: dto.active ?? true,
                triggers: (dto.triggers ?? []) as any,
                actions: dto.actions as any,
            },
        });
        return {
            id: scene.id,
            name: scene.name,
            active: scene.active,
            triggers: (scene.triggers as any[]) ?? [],
            actions: (scene.actions as any[]) ?? [],
            homeId: scene.homeId,
            createdAt: scene.createdAt,
            updatedAt: scene.updatedAt,
        } as SceneResponseDto;
    }

    async updateScene(
        sceneId: string,
        userId: string,
        dto: UpdateSceneDto
    ): Promise<SceneResponseDto> {
        await this.ensureUserCanAccessScene(userId, sceneId);
        const scene = await this.databaseService.scene.update({
            where: { id: sceneId },
            data: {
                ...(dto.name !== undefined && { name: dto.name }),
                ...(dto.active !== undefined && { active: dto.active }),
                ...(dto.triggers !== undefined && {
                    triggers: dto.triggers as any,
                }),
                ...(dto.actions !== undefined && {
                    actions: dto.actions as any,
                }),
            },
        });
        return {
            id: scene.id,
            name: scene.name,
            active: scene.active,
            triggers: (scene.triggers as any[]) ?? [],
            actions: (scene.actions as any[]) ?? [],
            homeId: scene.homeId,
            createdAt: scene.createdAt,
            updatedAt: scene.updatedAt,
        } as SceneResponseDto;
    }

    /**
     * Đẩy job RUN_SCENE vào queue để worker thực thi lần lượt các action
     */
    async runScene(
        sceneId: string,
        userId: string
    ): Promise<{ jobId: string; message: string }> {
        await this.ensureUserCanAccessScene(userId, sceneId);
        const scene = await this.databaseService.scene.findUnique({
            where: { id: sceneId },
        });
        if (!scene) {
            throw new HttpException(
                'scene.error.sceneNotFound',
                HttpStatus.NOT_FOUND
            );
        }
        if (!scene.active) {
            throw new HttpException(
                'scene.error.sceneInactive',
                HttpStatus.BAD_REQUEST
            );
        }

        const job = await this.deviceQueue.add(
            DEVICE_JOBS.RUN_SCENE,
            { sceneId },
            {
                priority: 1,
                attempts: 1,
                removeOnComplete: true,
            }
        );

        return {
            jobId: job.id ?? '',
            message: 'scene.success.runQueued',
        };
    }

    /**
     * Chạy scene do trigger kích hoạt (schedule / location / device state).
     * Không kiểm tra user; dùng nội bộ bởi trigger executors.
     */
    async runSceneByTrigger(sceneId: string): Promise<void> {
        const scene = await this.databaseService.scene.findUnique({
            where: { id: sceneId },
        });
        if (!scene || !scene.active) return;

        await this.deviceQueue.add(
            DEVICE_JOBS.RUN_SCENE,
            { sceneId },
            { priority: 1, attempts: 1, removeOnComplete: true }
        );
    }
}
