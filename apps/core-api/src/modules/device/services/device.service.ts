import {
  Injectable,
  NotFoundException,
  HttpException,
  HttpStatus,
} from '@nestjs/common';
import { DatabaseService } from '@app/database';
import { RedisService } from '@app/redis-cache';
import { EHomeRole } from '@app/common';
import { GetDevicesDto } from '../dto/get-devices.dto';
import {
  DEFAULT_DEVICE_UI_CONFIGS,
  DEVICE_UI_CONFIG_KEY,
  DEVICE_UI_CONFIG_REDIS_KEY,
  type DeviceUiConfig,
} from '../constants/device-ui-config.constant';

@Injectable()
export class DeviceService {
  constructor(
    private readonly db: DatabaseService,
    private readonly redis: RedisService,
  ) {}

  async getUserDevices(userId: string, query: GetDevicesDto) {
    const { page = 1, limit = 10, homeId } = query;
    const skip = (page - 1) * limit;

    // 0. Nếu có homeId, kiểm tra user có quyền truy cập home đó
    if (homeId) {
      const home = await this.db.home.findFirst({
        where: {
          id: homeId,
          OR: [{ ownerId: userId }, { members: { some: { userId: userId } } }],
        },
        select: { id: true },
      });
      if (!home) {
        throw new HttpException(
          'home.error.notFoundOrNoAccess',
          HttpStatus.FORBIDDEN,
        );
      }
    }

    // Điều kiện chung: thiết bị mà user có thể thấy (owner root, được share, hoặc là OWNER của Home đó)
    const accessibleCondition = {
      ...(homeId && { homeId: homeId }),
      OR: [
        { ownerId: userId },
        { sharedUsers: { some: { userId } } },
        { home: { ownerId: userId } },
        { home: { members: { some: { userId, role: EHomeRole.OWNER } } } },
      ],
    };

    // 1. Lấy khung dữ liệu từ DB — entity-based
    const [devices, total] = await Promise.all([
      this.db.device.findMany({
        where: accessibleCondition,
        include: {
          entities: {
            include: { attributes: true },
            orderBy: { sortOrder: 'asc' },
          },
          room: { select: { id: true, name: true } },
          deviceModel: { select: { code: true, name: true, config: true } },
        },
        skip,
        take: limit,
        orderBy: { sortOrder: 'asc' },
      }),
      this.db.device.count({
        where: accessibleCondition,
      }),
    ]);

    if (devices.length === 0) {
      return { data: [], meta: { total, page, lastPage: 0 } };
    }

    // 2. Redis Pipeline: lấy Status và Shadow cho tất cả device
    const pipeline = this.redis.getClient().pipeline();

    devices.forEach((device) => {
      pipeline.get(`status:${device.token}`);
      pipeline.hgetall(`device:shadow:${device.token}`);
    });

    const results = await pipeline.exec();

    // 3. Hydrate: trộn DB entities + Redis state
    const enrichedDevices = devices.map((device, index) => {
      const status = (results?.[index * 2]?.[1] as string) || 'offline';
      const shadow =
        (results?.[index * 2 + 1]?.[1] as Record<string, string>) || {};

      const entities = device.entities.map((entity) => {
        // Hydrate entity primary state from shadow
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        let currentState: any = entity.state;
        if (entity.commandKey && shadow[entity.commandKey] !== undefined) {
          try {
            currentState = JSON.parse(shadow[entity.commandKey]);
          } catch {
            currentState = shadow[entity.commandKey];
          }
        }

        // Hydrate attributes from shadow
        const attributes = entity.attributes.map((attr) => {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          let currentValue: any = attr.numValue ?? attr.strValue;
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const attrConfig = attr.config as any;
          const attrCommandKey = attrConfig?.commandKey ?? attr.key;

          if (shadow[attrCommandKey] !== undefined) {
            try {
              currentValue = JSON.parse(shadow[attrCommandKey]);
            } catch {
              currentValue = shadow[attrCommandKey];
            }
          }

          return {
            ...attr,
            currentValue,
          };
        });

        return {
          ...entity,
          currentState,
          attributes,
        };
      });

      return {
        id: device.id,
        name: device.name,
        identifier: device.identifier,
        token: device.token,
        status,
        type: device.deviceModel?.code || 'unknown',
        modelName: device.deviceModel?.name || '',
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        modelConfig: (device.deviceModel as any)?.config ?? null,
        protocol: device.protocol,
        ownership: 'OWNER' as const,
        sortOrder: device.sortOrder,
        room: device.room,
        entities,
      };
    });

    return {
      data: enrichedDevices,
      meta: {
        total,
        page,
        lastPage: Math.ceil(total / limit),
      },
    };
  }

  async getDeviceDetail(deviceId: string, userId: string) {
    const device = await this.db.device.findFirst({
      where: {
        id: deviceId,
        OR: [
          { ownerId: userId },
          { sharedUsers: { some: { userId } } },
          { home: { ownerId: userId } },
          { home: { members: { some: { userId, role: EHomeRole.OWNER } } } },
        ],
      },
      include: {
        entities: {
          include: { attributes: true },
          orderBy: { sortOrder: 'asc' },
        },
        room: { select: { name: true } },
        deviceModel: { select: { name: true, code: true, config: true } },
      },
    });

    if (!device) {
      throw new NotFoundException('device.error.notFound');
    }

    // Redis: lấy status và shadow
    const [statusRes, shadowRes] = await this.redis
      .getClient()
      .pipeline()
      .get(`status:${device.token}`)
      .hgetall(`device:shadow:${device.token}`)
      .exec();

    const status = (statusRes?.[1] as string) || 'offline';
    const shadow = (shadowRes?.[1] as Record<string, string>) || {};

    // Hydrate entities
    const entities = device.entities.map((entity) => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      let currentState: any = entity.state;
      if (entity.commandKey && shadow[entity.commandKey] !== undefined) {
        try {
          currentState = JSON.parse(shadow[entity.commandKey]);
        } catch {
          currentState = shadow[entity.commandKey];
        }
      }

      const attributes = entity.attributes.map((attr) => {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        let currentValue: any = attr.numValue ?? attr.strValue;
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const attrConfig = attr.config as any;
        const attrCommandKey = attrConfig?.commandKey ?? attr.key;

        if (shadow[attrCommandKey] !== undefined) {
          try {
            currentValue = JSON.parse(shadow[attrCommandKey]);
          } catch {
            currentValue = shadow[attrCommandKey];
          }
        }

        return { ...attr, currentValue };
      });

      return { ...entity, currentState, attributes };
    });

    return {
      ...device,
      status,
      entities,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      modelConfig: (device.deviceModel as any)?.config ?? null,
    };
  }

  /**
   * Siri Sync: trả về tất cả devices + scenes cho user
   */
  async getSiriSyncData(userId: string) {
    const devices = await this.db.device.findMany({
      where: {
        OR: [
          { ownerId: userId },
          { sharedUsers: { some: { userId } } },
          { home: { ownerId: userId } },
          { home: { members: { some: { userId, role: EHomeRole.OWNER } } } },
        ],
      },
      include: {
        entities: {
          select: {
            code: true,
            name: true,
            domain: true,
          },
        },
        room: { select: { id: true, name: true } },
        deviceModel: { select: { name: true, code: true } },
      },
      orderBy: { createdAt: 'desc' },
    });

    const pipeline = this.redis.getClient().pipeline();
    devices.forEach((d) => pipeline.get(`status:${d.token}`));
    const statusResults = await pipeline.exec();

    const siriDevices = devices.map((d, i) => ({
      id: d.id,
      name: d.name,
      token: d.token,
      identifier: d.identifier,
      type: d.deviceModel?.code || 'unknown',
      modelName: d.deviceModel?.name || '',
      room: d.room?.name || null,
      roomId: d.room?.id || null,
      status: (statusResults?.[i]?.[1] as string) || 'offline',
      entities: d.entities.map((e) => ({
        code: e.code,
        name: e.name,
        domain: e.domain,
      })),
    }));

    const homes = await this.db.home.findMany({
      where: {
        OR: [{ ownerId: userId }, { members: { some: { userId } } }],
      },
      select: { id: true },
    });

    const homeIds = homes.map((h) => h.id);

    const scenes = await this.db.scene.findMany({
      where: {
        homeId: { in: homeIds },
        active: true,
      },
      select: { id: true, name: true, homeId: true },
      orderBy: { createdAt: 'desc' },
    });

    return {
      devices: siriDevices,
      scenes: scenes.map((s) => ({
        id: s.id,
        name: s.name,
        homeId: s.homeId,
      })),
    };
  }

  // ──────────────────────────────────────────────
  // DEVICE UI CONFIG (Redis cache + DB fallback)
  // ──────────────────────────────────────────────

  async getDeviceUiConfigs(): Promise<DeviceUiConfig[]> {
    const cached = await this.redis.get(DEVICE_UI_CONFIG_REDIS_KEY);
    if (cached) {
      try {
        return JSON.parse(cached);
      } catch {
        // Invalid cache, fall through to DB
      }
    }

    const dbConfig = await this.db.systemConfig.findUnique({
      where: { key: DEVICE_UI_CONFIG_KEY },
    });

    if (dbConfig?.value) {
      try {
        const configs = JSON.parse(dbConfig.value) as DeviceUiConfig[];
        await this.redis.set(DEVICE_UI_CONFIG_REDIS_KEY, dbConfig.value);
        return configs;
      } catch {
        // Invalid DB value, seed defaults
      }
    }

    const defaultJson = JSON.stringify(DEFAULT_DEVICE_UI_CONFIGS);
    await this.db.systemConfig.upsert({
      where: { key: DEVICE_UI_CONFIG_KEY },
      update: { value: defaultJson },
      create: {
        key: DEVICE_UI_CONFIG_KEY,
        value: defaultJson,
        description: 'Device UI config for app rendering (JSON array)',
      },
    });
    await this.redis.set(DEVICE_UI_CONFIG_REDIS_KEY, defaultJson);

    return DEFAULT_DEVICE_UI_CONFIGS;
  }

  async refreshDeviceUiConfigCache(): Promise<{ message: string }> {
    const dbConfig = await this.db.systemConfig.findUnique({
      where: { key: DEVICE_UI_CONFIG_KEY },
    });

    if (dbConfig?.value) {
      await this.redis.set(DEVICE_UI_CONFIG_REDIS_KEY, dbConfig.value);
    } else {
      const defaultJson = JSON.stringify(DEFAULT_DEVICE_UI_CONFIGS);
      await this.db.systemConfig.upsert({
        where: { key: DEVICE_UI_CONFIG_KEY },
        update: { value: defaultJson },
        create: {
          key: DEVICE_UI_CONFIG_KEY,
          value: defaultJson,
          description: 'Device UI config for app rendering (JSON array)',
        },
      });
      await this.redis.set(DEVICE_UI_CONFIG_REDIS_KEY, defaultJson);
    }

    return { message: 'Device UI config cache refreshed successfully' };
  }

  /**
   * Lấy timeline hoạt động thiết bị:
   * Merge EntityStateHistory (state changes) + DeviceConnectionLog (online/offline)
   * → sort by createdAt DESC → paginate
   */
  async getDeviceTimeline(
    deviceId: string,
    userId: string,
    query: { page?: number; limit?: number; entityCode?: string; from?: string; to?: string },
  ) {
    // 1. Verify ownership
    const device = await this.db.device.findFirst({
      where: {
        id: deviceId,
        OR: [
          { ownerId: userId },
          { sharedUsers: { some: { userId } } },
        ],
      },
      select: { id: true },
    });

    if (!device) {
      throw new NotFoundException('device.error.notFound');
    }

    const page = query.page ?? 1;
    const limit = query.limit ?? 30;
    const dateFilter: { gte?: Date; lte?: Date } = {};
    if (query.from) dateFilter.gte = new Date(query.from);
    if (query.to) dateFilter.lte = new Date(query.to);

    // 2. Query state changes (EntityStateHistory)
    const entityFilter: Record<string, unknown> = { device: { id: deviceId } };
    if (query.entityCode) entityFilter.code = query.entityCode;

    const stateHistoryWhere: Record<string, unknown> = {
      entity: entityFilter,
    };
    if (Object.keys(dateFilter).length > 0) {
      stateHistoryWhere.createdAt = dateFilter;
    }

    const stateHistory = await this.db.entityStateHistory.findMany({
      where: stateHistoryWhere,
      include: {
        entity: { select: { code: true, name: true, domain: true } },
      },
      orderBy: { createdAt: 'desc' },
      // Fetch more than needed so we can merge+paginate in memory
      take: limit * page + limit,
    });

    // 3. Query connection logs (DeviceConnectionLog)
    const connectionWhere: Record<string, unknown> = { deviceId };
    if (Object.keys(dateFilter).length > 0) {
      connectionWhere.createdAt = dateFilter;
    }

    const connectionLogs = await this.db.deviceConnectionLog.findMany({
      where: connectionWhere,
      orderBy: { createdAt: 'desc' },
      take: limit * page + limit,
    });

    // 4. Merge into unified timeline
    type TimelineItem = {
      type: 'state' | 'connection';
      event: string;
      entityCode: string | null;
      entityName: string | null;
      source: string | null;
      createdAt: Date;
    };

    const timeline: TimelineItem[] = [];

    for (const s of stateHistory) {
      timeline.push({
        type: 'state',
        event: s.valueText ?? (s.value !== null ? String(s.value) : 'unknown'),
        entityCode: s.entity.code,
        entityName: s.entity.name,
        source: s.source ?? 'mqtt',
        createdAt: s.createdAt,
      });
    }

    for (const c of connectionLogs) {
      timeline.push({
        type: 'connection',
        event: c.event,
        entityCode: null,
        entityName: null,
        source: null,
        createdAt: c.createdAt,
      });
    }

    // 5. Sort merged timeline by createdAt DESC
    timeline.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());

    // 6. Paginate
    const skip = (page - 1) * limit;
    const paginated = timeline.slice(skip, skip + limit);
    const total = timeline.length;
    const lastPage = Math.ceil(total / limit);

    return {
      data: paginated,
      meta: { total, page, lastPage },
    };
  }

  async updateEntityName(deviceId: string, userId: string, entityCode: string, name: string) {
    // 1. Verify device exists and belongs to user's home
    const device = await this.db.device.findFirst({
      where: {
        id: deviceId,
        OR: [
          { ownerId: userId },
          { sharedUsers: { some: { userId } } },
          { home: { ownerId: userId } },
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          { home: { members: { some: { userId, role: 'OWNER' as any } } } },
        ],
      },
    });

    if (!device) {
      throw new NotFoundException(`Device with ID ${deviceId} not found or access denied`);
    }

    // 2. Find the entity
    const entity = await this.db.deviceEntity.findFirst({
      where: { deviceId, code: entityCode },
    });

    if (!entity) {
      throw new NotFoundException(`Entity ${entityCode} not found on device ${deviceId}`);
    }

    // 3. Update the entity's name
    const updatedEntity = await this.db.deviceEntity.update({
      where: { id: entity.id },
      data: { name },
    });

    return updatedEntity;
  }

  async updateDeviceName(deviceId: string, userId: string, name: string) {
    // 1. Verify device exists and belongs to user's home
    const device = await this.db.device.findFirst({
      where: {
        id: deviceId,
        OR: [
          { ownerId: userId },
          { sharedUsers: { some: { userId } } },
          { home: { ownerId: userId } },
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          { home: { members: { some: { userId, role: 'OWNER' as any } } } },
        ],
      },
    });

    if (!device) {
      throw new NotFoundException(`Device with ID ${deviceId} not found or access denied`);
    }

    // 2. Update the device's name
    const updatedDevice = await this.db.device.update({
      where: { id: deviceId },
      data: { name },
    });

    return updatedDevice;
  }

  /**
   * Xoá thiết bị (Unbind) — Soft-delete: đánh dấu unboundAt.
   * MQTT unbind sẽ do iot-gateway xử lý khi chip gửi status tiếp theo.
   * HardwareRegistry giữ nguyên → chip vẫn auth EMQX được → nhận unbind.
   * Redis cleanup ngay → user không thấy device trên App nữa.
   */
  async deleteDevice(deviceId: string, userId: string): Promise<void> {
    // 1. Verify ownership
    const device = await this.db.device.findFirst({
      where: { id: deviceId, ownerId: userId },
      select: { id: true, token: true },
    });

    if (!device) {
      throw new NotFoundException('device.error.notFound');
    }

    const { token, id } = device;

    // 2. Soft-delete — set unboundAt timestamp
    //    iot-gateway sẽ detect khi chip gửi status → publish unbind → hard delete
    await this.db.device.update({
      where: { id: deviceId },
      data: { unboundAt: new Date() },
    });

    // 3. Redis cleanup ngay (user không thấy device trên App nữa)
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const cleanupTasks: Promise<any>[] = [
      this.redis.del(`status:${token}`).catch(() => undefined),
      this.redis.del(`device:shadow:${token}`).catch(() => undefined),
    ];

    const trackingKey = `device:${id}:_ekeys`;
    cleanupTasks.push(
      this.redis
        .smembers(trackingKey)
        .then((keys) =>
          keys.length > 0
            ? this.redis.del([...keys, trackingKey])
            : this.redis.del(trackingKey),
        )
        .catch(() => undefined),
    );

    await Promise.all(cleanupTasks);
  }
}
