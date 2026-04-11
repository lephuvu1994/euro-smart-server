import { HttpStatus, Injectable, HttpException } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { DatabaseService } from '@app/database';
import { APP_BULLMQ_QUEUES, DEVICE_JOBS, SceneTriggerIndexService } from '@app/common';
import { Prisma } from '@prisma/client';
import { CreateSceneDto, UpdateSceneDto } from './dtos/request';
import { SceneResponseDto } from './dtos/response/scene.response';

interface SceneTriggerJson {
  type: string;
  [key: string]: unknown;
}

interface SceneActionJson {
  deviceToken: string;
  entityCode: string;
  value: string | number | boolean;
}

/**
 * Scene (Gladys / Home Assistant style):
 * 1. Manual: triggers = [] → chỉ chạy qua POST :sceneId/run.
 * 2. Automation: có trigger(s) → executor đã implement:
 *    - SCHEDULE: SceneScheduleCronService (worker) @Cron mỗi phút.
 *    - LOCATION: POST /scenes/triggers/location → SceneTriggerLocationService.
 *    - DEVICE_STATE: MQTT → CHECK_DEVICE_STATE_TRIGGERS → DeviceControlProcessor (Redis index lookup).
 */
@Injectable()
export class SceneService {
  constructor(
    private readonly databaseService: DatabaseService,
    private readonly sceneTriggerIndexService: SceneTriggerIndexService,
    @InjectQueue(APP_BULLMQ_QUEUES.DEVICE_CONTROL)
    private readonly deviceQueue: Queue,
  ) {}

  private async ensureUserCanAccessHome(userId: string, homeId: string): Promise<void> {
    const home = await this.databaseService.home.findFirst({
      where: {
        id: homeId,
        OR: [{ ownerId: userId }, { members: { some: { userId } } }],
      },
    });
    if (!home) {
      throw new HttpException('scene.error.homeNotFoundOrNoAccess', HttpStatus.FORBIDDEN);
    }
  }

  private async ensureUserCanAccessScene(userId: string, sceneId: string): Promise<void> {
    const scene = await this.databaseService.scene.findFirst({
      where: {
        id: sceneId,
        home: {
          OR: [{ ownerId: userId }, { members: { some: { userId } } }],
        },
      },
    });
    if (!scene) {
      throw new HttpException('scene.error.sceneNotFoundOrNoAccess', HttpStatus.FORBIDDEN);
    }
  }

  private toResponseDto(scene: {
    id: string;
    name: string;
    active: boolean;
    minIntervalSeconds: number;
    icon: string | null;
    color: string | null;
    roomId: string | null;
    triggers: Prisma.JsonValue;
    actions: Prisma.JsonValue;
    homeId: string;
    createdAt: Date;
    updatedAt: Date;
  }): SceneResponseDto {
    return {
      id: scene.id,
      name: scene.name,
      active: scene.active,
      minIntervalSeconds: scene.minIntervalSeconds,
      icon: scene.icon,
      color: scene.color,
      roomId: scene.roomId,
      triggers: Array.isArray(scene.triggers)
        ? (scene.triggers as unknown as SceneTriggerJson[])
        : [],
      actions: Array.isArray(scene.actions)
        ? (scene.actions as unknown as SceneActionJson[])
        : [],
      homeId: scene.homeId,
      createdAt: scene.createdAt,
      updatedAt: scene.updatedAt,
    } as unknown as SceneResponseDto;
  }

  async getScenesByHome(homeId: string, userId: string): Promise<SceneResponseDto[]> {
    await this.ensureUserCanAccessHome(userId, homeId);
    const scenes = await this.databaseService.scene.findMany({
      where: { homeId },
      orderBy: { createdAt: 'desc' },
    });
    return scenes.map((s) => this.toResponseDto(s));
  }

  async getScene(sceneId: string, userId: string): Promise<SceneResponseDto> {
    await this.ensureUserCanAccessScene(userId, sceneId);
    const scene = await this.databaseService.scene.findUnique({ where: { id: sceneId } });
    if (!scene) {
      throw new HttpException('scene.error.sceneNotFound', HttpStatus.NOT_FOUND);
    }
    return this.toResponseDto(scene);
  }

  async createScene(
    homeId: string,
    userId: string,
    dto: CreateSceneDto,
  ): Promise<SceneResponseDto> {
    await this.ensureUserCanAccessHome(userId, homeId);

    const [user, sceneCount] = await Promise.all([
      this.databaseService.user.findUnique({ where: { id: userId }, select: { maxScenes: true } }),
      this.databaseService.scene.count({ where: { homeId } }),
    ]);

    if (sceneCount >= (user?.maxScenes ?? 100)) {
      throw new HttpException('scene.error.sceneQuotaExceeded', HttpStatus.BAD_REQUEST);
    }
    const scene = await this.databaseService.scene.create({
      data: {
        homeId,
        name: dto.name,
        active: dto.active ?? true,
        icon: dto.icon ?? null,
        color: dto.color ?? null,
        roomId: dto.roomId ?? null,
        minIntervalSeconds: dto.minIntervalSeconds ?? 60,
        triggers: (dto.triggers ?? []) as unknown as Prisma.InputJsonValue,
        actions: dto.actions as unknown as Prisma.InputJsonValue,
      },
    });

    // Build Redis reverse-index for DEVICE_STATE triggers
    if (dto.triggers && dto.triggers.length > 0) {
      await this.sceneTriggerIndexService.rebuildIndex(
        scene.id,
        dto.triggers as unknown as SceneTriggerJson[],
      ).catch(() => undefined); // Non-blocking — index can be rebuilt on startup
    }

    return this.toResponseDto(scene);
  }

  async updateScene(
    sceneId: string,
    userId: string,
    dto: UpdateSceneDto,
  ): Promise<SceneResponseDto> {
    await this.ensureUserCanAccessScene(userId, sceneId);
    const scene = await this.databaseService.scene.update({
      where: { id: sceneId },
      data: {
        ...(dto.name !== undefined && { name: dto.name }),
        ...(dto.active !== undefined && { active: dto.active }),
        ...(dto.minIntervalSeconds !== undefined && { minIntervalSeconds: dto.minIntervalSeconds }),
        ...(dto.icon !== undefined && { icon: dto.icon }),
        ...(dto.color !== undefined && { color: dto.color }),
        // roomId: null = xóa gán phòng; string = set phòng; undefined = giữ nguyên
        ...(dto.roomId !== undefined && { roomId: dto.roomId }),
        ...(dto.triggers !== undefined && {
          triggers: dto.triggers as unknown as Prisma.InputJsonValue,
        }),
        ...(dto.actions !== undefined && {
          actions: dto.actions as unknown as Prisma.InputJsonValue,
        }),
      },
    });

    // Rebuild Redis reverse-index when triggers change
    if (dto.triggers !== undefined) {
      await this.sceneTriggerIndexService.rebuildIndex(
        sceneId,
        dto.triggers as unknown as SceneTriggerJson[],
      ).catch(() => undefined);
    }

    return this.toResponseDto(scene);
  }

  async deleteScene(sceneId: string, userId: string): Promise<void> {
    await this.ensureUserCanAccessScene(userId, sceneId);
    await this.databaseService.scene.delete({ where: { id: sceneId } });
    // Remove Redis index entries for this scene
    await this.sceneTriggerIndexService.removeIndex(sceneId).catch(() => undefined);
  }

  /**
   * Đẩy job RUN_SCENE vào queue để worker thực thi lần lượt các action
   */
  async runScene(
    sceneId: string,
    userId: string,
  ): Promise<{ jobId: string; message: string }> {
    await this.ensureUserCanAccessScene(userId, sceneId);
    const scene = await this.databaseService.scene.findUnique({ where: { id: sceneId } });
    if (!scene) {
      throw new HttpException('scene.error.sceneNotFound', HttpStatus.NOT_FOUND);
    }
    if (!scene.active) {
      throw new HttpException('scene.error.sceneInactive', HttpStatus.BAD_REQUEST);
    }

    const job = await this.deviceQueue.add(
      DEVICE_JOBS.RUN_SCENE,
      { sceneId },
      { priority: 1, attempts: 1, removeOnComplete: true },
    );

    return { jobId: job.id ?? '', message: 'scene.success.runQueued' };
  }

  /**
   * Chạy scene do trigger kích hoạt (schedule / location / device state).
   * Không kiểm tra user; dùng nội bộ bởi trigger executors.
   */
  async runSceneByTrigger(sceneId: string): Promise<void> {
    const scene = await this.databaseService.scene.findUnique({ where: { id: sceneId } });
    if (!scene?.active) return;

    await this.deviceQueue.add(
      DEVICE_JOBS.RUN_SCENE,
      { sceneId },
      { priority: 1, attempts: 1, removeOnComplete: true },
    );
  }
}
