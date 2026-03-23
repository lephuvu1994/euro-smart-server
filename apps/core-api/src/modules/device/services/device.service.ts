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
          OR: [
            { ownerId: userId },
            { members: { some: { userId: userId } } },
          ],
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

    // 1. Lấy khung dữ liệu từ DB
    const [devices, total] = await Promise.all([
      this.db.device.findMany({
        where: {
          ownerId: userId,
          ...(homeId && { homeId: homeId }),
        },
        include: {
          features: true,
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

    // 2. Sử dụng Redis Pipeline để lấy Status và Shadow của tất cả device trong 1 lần gọi
    // Thay vì loop 10 lần gọi 10 lệnh Redis, ta gọi 1 lần duy nhất.
    const pipeline = this.redis.getClient().pipeline();

    devices.forEach((device) => {
      pipeline.get(`status:${device.token}`); // Lấy online/offline
      pipeline.hgetall(`shadow:${device.token}`); // Lấy các giá trị tính năng
    });

    const results = await pipeline.exec();

    // 3. Hydrate (Trộn) dữ liệu DB và Redis
    const enrichedDevices = devices.map((device, index) => {
      const status = (results?.[index * 2]?.[1] as string) || 'offline';
      const shadow =
        (results?.[index * 2 + 1]?.[1] as Record<string, string>) || {};

      const features = device.features.map((f) => {
        let currentValue: any = null;

        // Ưu tiên lấy từ Shadow Redis
        if (shadow[f.code]) {
          try {
            currentValue = JSON.parse(shadow[f.code]);
          } catch {
            currentValue = shadow[f.code];
          }
        } else {
          // Nếu Redis chưa có (thiết bị mới), lấy từ DB
          currentValue = f.lastValue !== null ? f.lastValue : f.lastValueString;
        }

        return {
          ...f,
          currentValue: currentValue,
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
        features,
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
    // 1. Lấy thông tin tĩnh từ Database (tìm by device ID)
    const device = await this.db.device.findFirst({
      where: {
        id: deviceId,
        ownerId: userId, // Bảo mật: Chỉ chủ sở hữu mới được xem
      },
      include: {
        features: true,
        room: { select: { name: true } },
        deviceModel: { select: { name: true, code: true } },
      },
    });

    if (!device) {
      throw new NotFoundException('Không tìm thấy thiết bị');
    }

    // 2. Lấy trạng thái thời gian thực từ Redis
    // Dùng Pipeline để lấy cả status và shadow trong 1 nốt nhạc
    const [statusRes, shadowRes] = await this.redis
      .getClient()
      .pipeline()
      .get(`status:${device.token}`)
      .hgetall(`shadow:${device.token}`)
      .exec();

    const status = (statusRes?.[1] as string) || 'offline';
    const shadow = (shadowRes?.[1] as Record<string, string>) || {};

    // 3. Trộn dữ liệu (Data Hydration)
    const features = device.features.map((f) => {
      let currentValue: any = null;

      // Kiểm tra xem Redis có giá trị mới nhất không
      if (shadow[f.code]) {
        try {
          // Parse vì chúng ta lưu JSON string trong Redis Hash
          currentValue = JSON.parse(shadow[f.code]);
        } catch {
          currentValue = shadow[f.code];
        }
      } else {
        // Fallback về DB nếu Redis rỗng (thiết bị chưa bao giờ gửi data)
        currentValue = f.lastValue !== null ? f.lastValue : f.lastValueString;
      }

      return {
        ...f,
        currentValue: currentValue,
      };
    });

    return {
      ...device,
      status,
      features,
    };
  }

  /**
   * Siri Sync: trả về tất cả devices + scenes cho user
   * Dùng bởi iOS native module để đăng ký Siri Shortcuts / INInteraction
   */
  async getSiriSyncData(userId: string) {
    // 1. Get all devices owned by user
    const devices = await this.db.device.findMany({
      where: { ownerId: userId },
      include: {
        features: {
          select: {
            code: true,
            name: true,
            type: true,
            category: true,
          },
        },
        room: { select: { id: true, name: true } },
        deviceModel: { select: { name: true, code: true } },
      },
      orderBy: { createdAt: 'desc' },
    });

    // 2. Get online status from Redis (pipeline)
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
      features: d.features.map((f) => ({
        code: f.code,
        name: f.name,
        type: f.type,
        category: f.category,
      })),
    }));

    // 3. Get all scenes from user's homes
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
      select: {
        id: true,
        name: true,
        homeId: true,
      },
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

  /**
   * Get device UI configs for app rendering.
   * Flow: Redis cache → DB → seed default values.
   */
  async getDeviceUiConfigs(): Promise<DeviceUiConfig[]> {
    // 1. Try Redis cache first
    const cached = await this.redis.get(DEVICE_UI_CONFIG_REDIS_KEY);
    if (cached) {
      try {
        return JSON.parse(cached);
      } catch {
        // Invalid cache, fall through to DB
      }
    }

    // 2. Fallback to DB
    const dbConfig = await this.db.systemConfig.findUnique({
      where: { key: DEVICE_UI_CONFIG_KEY },
    });

    if (dbConfig?.value) {
      try {
        const configs = JSON.parse(dbConfig.value) as DeviceUiConfig[];
        // Write to Redis cache (no TTL — manual refresh)
        await this.redis.set(DEVICE_UI_CONFIG_REDIS_KEY, dbConfig.value);
        return configs;
      } catch {
        // Invalid DB value, seed defaults
      }
    }

    // 3. Seed defaults → DB + Redis
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

  /**
   * Refresh Redis cache from DB.
   * Called after admin updates the config via dashboard.
   */
  async refreshDeviceUiConfigCache(): Promise<{ message: string }> {
    const dbConfig = await this.db.systemConfig.findUnique({
      where: { key: DEVICE_UI_CONFIG_KEY },
    });

    if (dbConfig?.value) {
      await this.redis.set(DEVICE_UI_CONFIG_REDIS_KEY, dbConfig.value);
    } else {
      // No config in DB, seed defaults
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
