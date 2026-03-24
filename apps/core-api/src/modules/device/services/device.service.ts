import {
  Injectable,
  NotFoundException,
  HttpException,
  HttpStatus,
} from '@nestjs/common';
import { DatabaseService } from '@app/database';
import { RedisService } from '@app/redis-cache';
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

    // 1. Lấy khung dữ liệu từ DB — entity-based
    const [devices, total] = await Promise.all([
      this.db.device.findMany({
        where: {
          ownerId: userId,
          ...(homeId && { homeId: homeId }),
        },
        include: {
          entities: {
            include: { attributes: true },
            orderBy: { sortOrder: 'asc' },
          },
          room: { select: { id: true, name: true } },
          deviceModel: { select: { code: true, name: true } },
        },
        skip,
        take: limit,
        orderBy: { sortOrder: 'asc' },
      }),
      this.db.device.count({
        where: { ownerId: userId, ...(homeId && { homeId: homeId }) },
      }),
    ]);

    if (devices.length === 0) {
      return { data: [], meta: { total, page, lastPage: 0 } };
    }

    // 2. Redis Pipeline: lấy Status và Shadow cho tất cả device
    const pipeline = this.redis.getClient().pipeline();

    devices.forEach((device) => {
      pipeline.get(`status:${device.token}`);
      pipeline.hgetall(`shadow:${device.token}`);
    });

    const results = await pipeline.exec();

    // 3. Hydrate: trộn DB entities + Redis state
    const enrichedDevices = devices.map((device, index) => {
      const status = (results?.[index * 2]?.[1] as string) || 'offline';
      const shadow =
        (results?.[index * 2 + 1]?.[1] as Record<string, string>) || {};

      const entities = device.entities.map((entity) => {
        // Hydrate entity primary state from shadow
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
          let currentValue: any = attr.numValue ?? attr.strValue;
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
        ownerId: userId,
      },
      include: {
        entities: {
          include: { attributes: true },
          orderBy: { sortOrder: 'asc' },
        },
        room: { select: { name: true } },
        deviceModel: { select: { name: true, code: true } },
      },
    });

    if (!device) {
      throw new NotFoundException('Không tìm thấy thiết bị');
    }

    // Redis: lấy status và shadow
    const [statusRes, shadowRes] = await this.redis
      .getClient()
      .pipeline()
      .get(`status:${device.token}`)
      .hgetall(`shadow:${device.token}`)
      .exec();

    const status = (statusRes?.[1] as string) || 'offline';
    const shadow = (shadowRes?.[1] as Record<string, string>) || {};

    // Hydrate entities
    const entities = device.entities.map((entity) => {
      let currentState: any = entity.state;
      if (entity.commandKey && shadow[entity.commandKey] !== undefined) {
        try {
          currentState = JSON.parse(shadow[entity.commandKey]);
        } catch {
          currentState = shadow[entity.commandKey];
        }
      }

      const attributes = entity.attributes.map((attr) => {
        let currentValue: any = attr.numValue ?? attr.strValue;
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
    };
  }

  /**
   * Siri Sync: trả về tất cả devices + scenes cho user
   */
  async getSiriSyncData(userId: string) {
    const devices = await this.db.device.findMany({
      where: { ownerId: userId },
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
}
