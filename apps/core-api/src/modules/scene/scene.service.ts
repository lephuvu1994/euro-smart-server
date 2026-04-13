import { HttpStatus, Injectable, HttpException, Logger } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { DatabaseService } from '@app/database';
import {
  APP_BULLMQ_QUEUES,
  DEVICE_JOBS,
  SceneTriggerIndexService,
} from '@app/common';
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
  delayMs?: number;
}

/**
 * Compiled action shape — enriched at save time with MQTT routing metadata.
 * At runtime the executor uses this directly with ZERO DB queries.
 */
export interface CompiledSceneAction {
  deviceToken: string;
  entityCode: string;
  value: string | number | boolean;
  delayMs?: number;
  /** Resolved at compile time */
  protocol: string;
  commandKey: string | null;
  commandSuffix: string;
}

/**
 * Wrapper stored in scene.compiledActions JSONB.
 * Contains both the actions and a snapshot of device configVersions
 * at compile time — used for lazy re-compile invalidation.
 */
export interface CompiledActionsPayload {
  actions: CompiledSceneAction[];
  versionSnapshot: Record<string, number>;
}

/**
 * Scene (Gladys / Home Assistant style):
 * 1. Manual: triggers = [] → chỉ chạy qua POST :sceneId/run.
 * 2. Automation: có trigger(s) → executor đã implement:
 *    - SCHEDULE: SceneScheduleCronService (worker) @Cron mỗi phút.
 *    - LOCATION: POST /scenes/triggers/location → SceneTriggerLocationService.
 *    - DEVICE_STATE: MQTT → CHECK_DEVICE_STATE_TRIGGERS → DeviceControlProcessor (Redis index lookup).
 *
 * [SCENE SCALING — Hybrid Compiled Actions]
 * Compiled actions embed protocol/commandKey/commandSuffix at save time → executor never needs
 * to query DeviceEntity at runtime. Lazy re-compile triggered by device.configVersion drift.
 * Version snapshot stored alongside actions enables precise cache invalidation.
 */
@Injectable()
export class SceneService {
  private readonly logger = new Logger(SceneService.name);

  constructor(
    private readonly databaseService: DatabaseService,
    private readonly sceneTriggerIndexService: SceneTriggerIndexService,
    @InjectQueue(APP_BULLMQ_QUEUES.DEVICE_CONTROL)
    private readonly deviceQueue: Queue,
  ) {}

  // ---------------------------------------------------------------------------
  // ACCESS GUARDS
  // ---------------------------------------------------------------------------

  private async ensureUserCanAccessHome(
    userId: string,
    homeId: string,
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
        HttpStatus.FORBIDDEN,
      );
    }
  }

  private async ensureUserCanAccessScene(
    userId: string,
    sceneId: string,
  ): Promise<void> {
    const scene = await this.databaseService.scene.findFirst({
      where: {
        id: sceneId,
        home: {
          OR: [{ ownerId: userId }, { members: { some: { userId } } }],
        },
      },
    });
    if (!scene) {
      throw new HttpException(
        'scene.error.sceneNotFoundOrNoAccess',
        HttpStatus.FORBIDDEN,
      );
    }
  }

  // ---------------------------------------------------------------------------
  // RESPONSE MAPPING
  // ---------------------------------------------------------------------------

  private toResponseDto(scene: {
    id: string;
    name: string;
    active: boolean;
    sortOrder: number;
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
      sortOrder: scene.sortOrder,
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

  // ---------------------------------------------------------------------------
  // [SCENE SCALING] Compile actions — resolves MQTT routing metadata at save time
  // ---------------------------------------------------------------------------

  /**
   * Pre-compiles scene actions by embedding protocol/commandKey/commandSuffix
   * from DeviceEntity so that the executor can fire MQTT without any DB lookup.
   *
   * Returns compiled actions + a snapshot of device configVersions at compile time.
   * The executor compares this snapshot against current versions to decide if re-compile is needed.
   */
  async compileSceneActions(
    actions: SceneActionJson[],
  ): Promise<CompiledActionsPayload> {
    if (!actions || actions.length === 0)
      return { actions: [], versionSnapshot: {} };

    // Extract unique tokens
    const deviceTokens = [...new Set(actions.map((a) => a.deviceToken))];

    // Single query — fetch entities (commandKey, commandSuffix)
    const devices = await this.databaseService.device.findMany({
      where: { token: { in: deviceTokens } },
      select: {
        token: true,
        protocol: true,
        configVersion: true,
        entities: {
          select: {
            code: true,
            commandKey: true,
            commandSuffix: true,
          },
        },
      },
    });

    // Index by token for O(1) lookup
    const deviceMap = new Map(devices.map((d) => [d.token, d]));

    // Snapshot configVersions at compile time
    const versionSnapshot: Record<string, number> = {};
    for (const d of devices) {
      versionSnapshot[d.token] = d.configVersion;
    }

    const compiled = actions.map((action) => {
      const device = deviceMap.get(action.deviceToken);
      if (!device) {
        this.logger.warn(
          `[compileSceneActions] Device not found: ${action.deviceToken}`,
        );
        return {
          ...action,
          protocol: 'MQTT',
          commandKey: null,
          commandSuffix: 'set',
        };
      }

      const entity = device.entities.find((e) => e.code === action.entityCode);

      return {
        deviceToken: action.deviceToken,
        entityCode: action.entityCode,
        value: action.value,
        delayMs: action.delayMs,
        protocol: device.protocol,
        commandKey: entity?.commandKey ?? null,
        commandSuffix: (entity?.commandSuffix ?? 'set').replace(/^\//, ''),
      };
    });

    return { actions: compiled, versionSnapshot };
  }

  // ---------------------------------------------------------------------------
  // CRUD
  // ---------------------------------------------------------------------------

  async getScenesByHome(
    homeId: string,
    userId: string,
  ): Promise<SceneResponseDto[]> {
    await this.ensureUserCanAccessHome(userId, homeId);
    const scenes = await this.databaseService.scene.findMany({
      where: { homeId },
      orderBy: [{ sortOrder: 'asc' }, { createdAt: 'desc' }],
    });
    return scenes.map((s) => this.toResponseDto(s));
  }

  async getScene(sceneId: string, userId: string): Promise<SceneResponseDto> {
    await this.ensureUserCanAccessScene(userId, sceneId);
    const scene = await this.databaseService.scene.findUnique({
      where: { id: sceneId },
    });
    if (!scene) {
      throw new HttpException(
        'scene.error.sceneNotFound',
        HttpStatus.NOT_FOUND,
      );
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
      this.databaseService.user.findUnique({
        where: { id: userId },
        select: { maxScenes: true },
      }),
      this.databaseService.scene.count({ where: { homeId } }),
    ]);

    if (sceneCount >= (user?.maxScenes ?? 100)) {
      throw new HttpException(
        'scene.error.sceneQuotaExceeded',
        HttpStatus.BAD_REQUEST,
      );
    }

    // [SCENE SCALING] Compile actions at create time
    const rawActions = (dto.actions ?? []) as SceneActionJson[];
    let compiledPayload: CompiledActionsPayload | null = null;
    let compiledAt: Date | null = null;
    try {
      compiledPayload = await this.compileSceneActions(rawActions);
      compiledAt = new Date();
    } catch (err) {
      this.logger.warn(
        `[createScene] compileSceneActions failed, will re-compile on first run: ${err}`,
      );
    }

    const scene = await this.databaseService.scene.create({
      data: {
        homeId,
        name: dto.name,
        active: dto.active ?? true,
        sortOrder: sceneCount,
        icon: dto.icon ?? null,
        color: dto.color ?? null,
        roomId: dto.roomId ?? null,
        minIntervalSeconds: dto.minIntervalSeconds ?? 60,
        triggers: (dto.triggers ?? []) as unknown as Prisma.InputJsonValue,
        actions: rawActions as unknown as Prisma.InputJsonValue,
        ...(compiledPayload
          ? {
              compiledActions:
                compiledPayload as unknown as Prisma.InputJsonValue,
              compiledAt,
            }
          : {}),
      },
    });

    // Build Redis reverse-index for DEVICE_STATE triggers (non-blocking)
    if (dto.triggers && dto.triggers.length > 0) {
      await this.sceneTriggerIndexService
        .rebuildIndex(scene.id, dto.triggers as unknown as SceneTriggerJson[])
        .catch(() => undefined);
    }

    return this.toResponseDto(scene);
  }

  async updateScene(
    sceneId: string,
    userId: string,
    dto: UpdateSceneDto,
  ): Promise<SceneResponseDto> {
    await this.ensureUserCanAccessScene(userId, sceneId);

    // [SCENE SCALING] Re-compile when actions change
    let compiledActionsUpdate: Record<string, unknown> = {};
    if (dto.actions !== undefined) {
      try {
        const compiled = await this.compileSceneActions(
          dto.actions as SceneActionJson[],
        );
        compiledActionsUpdate = {
          compiledActions: compiled as unknown as Prisma.InputJsonValue,
          compiledAt: new Date(),
        };
      } catch (err) {
        this.logger.warn(`[updateScene] compileSceneActions failed: ${err}`);
      }
    }

    const scene = await this.databaseService.scene.update({
      where: { id: sceneId },
      data: {
        ...(dto.name !== undefined && { name: dto.name }),
        ...(dto.active !== undefined && { active: dto.active }),
        ...(dto.minIntervalSeconds !== undefined && {
          minIntervalSeconds: dto.minIntervalSeconds,
        }),
        ...(dto.icon !== undefined && { icon: dto.icon }),
        ...(dto.color !== undefined && { color: dto.color }),
        ...(dto.roomId !== undefined && { roomId: dto.roomId }),
        ...(dto.triggers !== undefined && {
          triggers: dto.triggers as unknown as Prisma.InputJsonValue,
        }),
        ...(dto.actions !== undefined && {
          actions: dto.actions as unknown as Prisma.InputJsonValue,
        }),
        ...compiledActionsUpdate,
      },
    });

    // Rebuild Redis reverse-index when triggers change
    if (dto.triggers !== undefined) {
      await this.sceneTriggerIndexService
        .rebuildIndex(sceneId, dto.triggers as unknown as SceneTriggerJson[])
        .catch(() => undefined);
    }

    return this.toResponseDto(scene);
  }

  async deleteScene(sceneId: string, userId: string): Promise<void> {
    await this.ensureUserCanAccessScene(userId, sceneId);
    await this.databaseService.scene.delete({ where: { id: sceneId } });
    await this.sceneTriggerIndexService
      .removeIndex(sceneId)
      .catch(() => undefined);
  }

  /**
   * Sắp xếp lại thứ tự hiển thị scenes trong một home.
   */
  async reorderScenes(
    homeId: string,
    userId: string,
    sceneIds: string[],
  ): Promise<void> {
    await this.ensureUserCanAccessHome(userId, homeId);
    await this.databaseService.$transaction(
      sceneIds.map((id, index) =>
        this.databaseService.scene.update({
          where: { id },
          data: { sortOrder: index },
        }),
      ),
    );
  }

  /**
   * Đẩy job RUN_SCENE vào queue để worker thực thi lần lượt các action.
   */
  async runScene(
    sceneId: string,
    userId: string,
    delaySeconds?: number,
  ): Promise<{ jobId: string; message: string }> {
    await this.ensureUserCanAccessScene(userId, sceneId);
    const scene = await this.databaseService.scene.findUnique({
      where: { id: sceneId },
    });
    if (!scene) {
      throw new HttpException(
        'scene.error.sceneNotFound',
        HttpStatus.NOT_FOUND,
      );
    }
    if (!scene.active) {
      throw new HttpException(
        'scene.error.sceneInactive',
        HttpStatus.BAD_REQUEST,
      );
    }

    const job = await this.deviceQueue.add(
      DEVICE_JOBS.RUN_SCENE,
      { sceneId },
      {
        priority: 1,
        attempts: 1,
        removeOnComplete: true,
        ...(delaySeconds ? { delay: delaySeconds * 1000 } : {}),
      },
    );

    return { jobId: job.id ?? '', message: 'scene.success.runQueued' };
  }

  /**
   * Chạy scene do trigger kích hoạt (schedule / location / device state).
   */
  async runSceneByTrigger(sceneId: string): Promise<void> {
    const scene = await this.databaseService.scene.findUnique({
      where: { id: sceneId },
    });
    if (!scene?.active) return;

    await this.deviceQueue.add(
      DEVICE_JOBS.RUN_SCENE,
      { sceneId },
      { priority: 1, attempts: 1, removeOnComplete: true },
    );
  }
}
