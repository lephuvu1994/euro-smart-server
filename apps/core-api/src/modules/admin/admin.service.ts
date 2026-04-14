import {
  ConflictException,
  HttpException,
  HttpStatus,
  Injectable,
} from '@nestjs/common';
import { DatabaseService } from '@app/database';
import { RedisService } from '@app/redis-cache';

import { CreatePartnerDto } from './dtos/request/create-partner.dto';
import { CreateDeviceModelDto } from './dtos/request/create-device-model.dto';
import { UpdatePartnerDto } from './dtos/request/update-partner.dto';
import { SetMqttConfigDto } from './dtos/request/set-mqtt-config.dto';
import { UpdateSystemConfigDto } from './dtos/request/update-system-config.dto';
import { PartnerUsageResponseDto } from './dtos/response/partner-usage.response.dto';
import { SystemConfigResponseDto } from './dtos/response/system-config.response.dto';
import { UpdateDeviceUiConfigDto } from './dtos/request/update-device-ui-config.dto';
import { Prisma } from '@prisma/client';
import {
  DEFAULT_DEVICE_UI_CONFIGS,
  DEVICE_UI_CONFIG_KEY,
  DEVICE_UI_CONFIG_REDIS_KEY,
} from '../device/constants/device-ui-config.constant';

@Injectable()
export class AdminService {
  constructor(
    private readonly db: DatabaseService,
    private readonly redis: RedisService,
  ) {}

  // ──────────────────────────────────────────────
  // PARTNERS
  // ──────────────────────────────────────────────

  async createPartner(data: CreatePartnerDto) {
    const exists = await this.db.partner.findUnique({
      where: { code: data.code },
    });
    if (exists) throw new ConflictException('admin.error.partnerCodeExists');

    return this.db.partner.create({
      data: { code: data.code, name: data.name, isActive: true },
    });
  }

  async getPartnersForDropdown() {
    return this.db.partner.findMany({
      select: { id: true, code: true, name: true },
      orderBy: { name: 'asc' },
    });
  }

  async getPartnersUsage(): Promise<PartnerUsageResponseDto[]> {
    const partners = await this.db.partner.findMany({
      orderBy: { createdAt: 'desc' },
      select: {
        code: true,
        name: true,
        quotas: {
          select: {
            activatedCount: true,
            maxQuantity: true,
            deviceModel: { select: { code: true, name: true } },
          },
        },
      },
    });

    return partners.map((p) => ({
      companyCode: p.code,
      companyName: p.name,
      quotas: p.quotas.map((q) => ({
        modelCode: q.deviceModel.code,
        modelName: q.deviceModel.name,
        used: q.activatedCount,
        total: q.maxQuantity,
      })),
    }));
  }

  async updatePartner(partnerCode: string, data: UpdatePartnerDto) {
    const existing = await this.db.partner.findUnique({
      where: { code: partnerCode },
    });
    if (!existing)
      throw new HttpException('admin.error.partnerNotFound', HttpStatus.NOT_FOUND);

    return this.db.$transaction(async (prisma) => {
      if (data.name) {
        await prisma.partner.update({
          where: { code: partnerCode },
          data: { name: data.name },
        });
      }

      if (data.quotas !== undefined) {
        if (data.quotas.length === 0) {
          await prisma.licenseQuota.updateMany({
            where: { partnerId: existing.id },
            data: { maxQuantity: 0, isActive: false },
          });
        } else {
          await Promise.all(
            data.quotas.map(async (item) => {
              const model = await prisma.deviceModel.findUnique({
                where: { code: item.deviceModelCode },
              });
              if (!model)
                throw new HttpException(
                  `Device Model '${item.deviceModelCode}' not found`,
                  HttpStatus.BAD_REQUEST,
                );

              return prisma.licenseQuota.upsert({
                where: {
                  partnerId_deviceModelId: {
                    partnerId: existing.id,
                    deviceModelId: model.id,
                  },
                },
                update: {
                  maxQuantity: item.quantity,
                  ...(item.licenseDays !== undefined && {
                    licenseDays: item.licenseDays,
                  }),
                },
                create: {
                  partnerId: existing.id,
                  deviceModelId: model.id,
                  maxQuantity: item.quantity,
                  activatedCount: 0,
                  isActive: true,
                  ...(item.licenseDays !== undefined && {
                    licenseDays: item.licenseDays,
                  }),
                },
              });
            }),
          );
        }
      }

      return prisma.partner.findUnique({
        where: { code: partnerCode },
        include: { quotas: { include: { deviceModel: true } } },
      });
    });
  }

  // ──────────────────────────────────────────────
  // HARDWARE REGISTRY
  // ──────────────────────────────────────────────

  async getHardwares() {
    const records = await this.db.hardwareRegistry.findMany({
      orderBy: { activatedAt: 'desc' },
      include: {
        partner: { select: { code: true } },
        deviceModel: { select: { code: true } },
      },
      // Include User device mapped if necessary, but keep it simple
    });

    return records.map((r) => ({
      id: r.id,
      identifier: r.identifier,
      deviceToken: r.deviceToken,
      partnerCode: r.partner.code,
      deviceModelCode: r.deviceModel.code,
      firmwareVer: r.firmwareVer,
      isBanned: r.isBanned,
      activatedAt: r.activatedAt,
    }));
  }

  // ──────────────────────────────────────────────
  // DEVICE MODELS
  // ──────────────────────────────────────────────

  async createDeviceModel(data: CreateDeviceModelDto) {
    const exists = await this.db.deviceModel.findUnique({
      where: { code: data.code },
    });
    if (exists) throw new ConflictException('admin.error.modelCodeExists');

    return this.db.deviceModel.create({
      data: {
        code: data.code,
        name: data.name,
        description: data.description,
        config: data.config as Prisma.InputJsonValue,
      },
    });
  }

  async getDeviceModelsForDropdown() {
    return this.db.deviceModel.findMany({
      select: { code: true, name: true },
      orderBy: { name: 'asc' },
    });
  }

  async updateDeviceModel(code: string, data: CreateDeviceModelDto) {
    const existing = await this.db.deviceModel.findUnique({ where: { code } });
    if (!existing)
      throw new HttpException('admin.error.modelNotFound', HttpStatus.NOT_FOUND);

    return this.db.deviceModel.update({
      where: { code },
      data: {
        ...(data.name && { name: data.name }),
        ...(data.description !== undefined && {
          description: data.description,
        }),
        ...(data.config !== undefined && {
          config: data.config as Prisma.InputJsonValue,
        }),
      },
    });
  }

  async deleteDeviceModel(code: string) {
    const existing = await this.db.deviceModel.findUnique({ where: { code } });
    if (!existing)
      throw new HttpException('admin.error.modelNotFound', HttpStatus.NOT_FOUND);

    // Prisma Cascade delete will handle related quotas and hardwares based on schema constraints, 
    // but ideally we should restrict deletion if devices exist to avoid accidental wipe.
    const hardwareCount = await this.db.hardwareRegistry.count({ where: { deviceModelId: existing.id } });
    if (hardwareCount > 0) {
      throw new HttpException('admin.error.modelInUse', HttpStatus.BAD_REQUEST);
    }

    await this.db.deviceModel.delete({ where: { code } });
    return { message: 'Device model deleted successfully' };
  }

  // ──────────────────────────────────────────────
  // QUOTAS
  // ──────────────────────────────────────────────

  async getAllQuotas() {
    return this.db.licenseQuota.findMany({
      include: {
        partner: { select: { code: true, name: true } },
        deviceModel: { select: { code: true, name: true } },
      },
      orderBy: { partner: { code: 'asc' } },
    });
  }

  // ──────────────────────────────────────────────
  // SYSTEM CONFIGS
  // ──────────────────────────────────────────────

  async setMqttConfig(data: SetMqttConfigDto) {
    const entries = [
      { key: 'MQTT_HOST', value: data.host, description: 'MQTT Broker Host' },
    ];

    await Promise.all(
      entries.map((e) =>
        this.db.systemConfig.upsert({
          where: { key: e.key },
          update: { value: e.value },
          create: e,
        }),
      ),
    );

    return { message: 'MQTT configuration updated successfully' };
  }

  async getSystemConfigs(): Promise<SystemConfigResponseDto> {
    const configs = await this.db.systemConfig.findMany();
    const map = Object.fromEntries(configs.map((c) => [c.key, c.value]));

    return {
      mqttHost: map['MQTT_HOST'] || '',
      otpExpire: parseInt(map['OTP_EXPIRE'] || '5', 10),
    };
  }

  async updateSystemConfigs(data: UpdateSystemConfigDto) {
    const updates: { key: string; value: string; description: string }[] = [];

    if (data.mqttHost !== undefined)
      updates.push({
        key: 'MQTT_HOST',
        value: data.mqttHost,
        description: 'MQTT Broker Host',
      });

    if (data.otpExpire !== undefined)
      updates.push({
        key: 'OTP_EXPIRE',
        value: data.otpExpire.toString(),
        description: 'OTP Expiration (minutes)',
      });
    if (data.mqttWssUrl !== undefined)
      updates.push({
        key: 'MQTT_WSS_URL',
        value: data.mqttWssUrl,
        description: 'MQTT Broker WebSocket URL (App mobile)',
      });

    await Promise.all(
      updates.map((u) =>
        this.db.systemConfig.upsert({
          where: { key: u.key },
          update: { value: u.value },
          create: u,
        }),
      ),
    );

    return { message: 'System configuration updated successfully' };
  }

  // ──────────────────────────────────────────────
  // DEVICE UI CONFIG
  // ──────────────────────────────────────────────

  async getDeviceUiConfig() {
    const dbConfig = await this.db.systemConfig.findUnique({
      where: { key: DEVICE_UI_CONFIG_KEY },
    });

    if (dbConfig?.value) {
      try {
        return JSON.parse(dbConfig.value);
      } catch {
        // Invalid JSON, return defaults
      }
    }

    return DEFAULT_DEVICE_UI_CONFIGS;
  }

  async updateDeviceUiConfig(data: UpdateDeviceUiConfigDto) {
    const configJson = JSON.stringify(data.configs);

    // Write to DB
    await this.db.systemConfig.upsert({
      where: { key: DEVICE_UI_CONFIG_KEY },
      update: { value: configJson },
      create: {
        key: DEVICE_UI_CONFIG_KEY,
        value: configJson,
        description: 'Device UI config for app rendering (JSON array)',
      },
    });

    // Refresh Redis cache immediately
    await this.redis.set(DEVICE_UI_CONFIG_REDIS_KEY, configJson);

    return { message: 'Device UI config updated and cache refreshed' };
  }

  // ──────────────────────────────────────────────
  // DASHBOARD
  // ──────────────────────────────────────────────

  async getDashboardStats() {
    const [totalPartners, totalDevices, totalModels, quotas] = await Promise.all([
      this.db.partner.count(),
      this.db.hardwareRegistry.count(),
      this.db.deviceModel.count(),
      this.db.licenseQuota.findMany({ select: { isActive: true } }),
    ]);

    const activeQuotas = quotas.filter((q) => q.isActive).length;

    return {
      totalPartners,
      totalDevices,
      totalDeviceModels: totalModels,
      activeQuotas,
    };
  }
}
