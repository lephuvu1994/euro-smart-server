import { Injectable, BadRequestException } from '@nestjs/common';
import { DatabaseService } from '@app/database';
import { RedisService } from '@app/redis-cache';
import { RegisterDeviceDto } from '../dto/register-device.dto';
import { v4 as uuidv4 } from 'uuid';
import type { EntityDomain, AttributeValueType, Prisma } from '@prisma/client';

import type {
  IDeviceModelConfig,
  IBlueprintEntity,
  IBlueprintAttribute,
} from '../interfaces/device-model-config.interface';

/**
 * Blueprint v2 entity format (from DeviceModel.config):
 * @see IDeviceModelConfig
 */

@Injectable()
export class DeviceProvisioningService {
  constructor(
    private readonly databaseService: DatabaseService,
    private readonly redisService: RedisService,
  ) {}

  /**
   * Trích xuất danh sách entities từ DeviceModel.config.
   * Hỗ trợ cả 2 format:
   *   - Object chuẩn: { entities: [...] }
   *   - Legacy array:  [{ code, name, domain, ... }]
   */
  private extractEntities(config: unknown): IBlueprintEntity[] {
    if (Array.isArray(config)) return config;
    const obj = config as IDeviceModelConfig | null;
    return obj?.entities ?? [];
  }

  // ─── App trực tiếp register (flow BLE/Provision Token) ───────
  async registerAndClaim(userId: string, dto: RegisterDeviceDto) {
    if (!userId) throw new BadRequestException('device.error.invalidUser');

    // Fetch MQTT Host, DeviceModel, Partner in parallel (3 queries → 1 roundtrip)
    const [mqttConfig, model, partner] = await Promise.all([
      this.databaseService.systemConfig.findUnique({
        where: { key: 'MQTT_HOST' },
      }),
      this.databaseService.deviceModel.findUnique({
        where: { code: dto.deviceCode },
      }),
      this.databaseService.partner.findUnique({
        where: { code: dto.partnerCode },
      }),
    ]);
    const mqttHost = mqttConfig?.value || process.env.MQTT_HOST || 'localhost';

    if (!model || !partner)
      throw new BadRequestException('device.error.invalidModelOrPartner');

    // Thu thập thông tin cần cleanup Redis (sẽ thực hiện SAU transaction)
    let redisCleanup: { oldToken?: string; oldDeviceId?: string } = {};

    const result = await this.databaseService.$transaction(
      async (tx) => {
        const newDeviceToken = uuidv4();

        // Query quota + hardware in parallel (2 independent queries → 1 roundtrip)
        const [quota, existingHardware] = await Promise.all([
          tx.licenseQuota.findUnique({
            where: {
              partnerId_deviceModelId: {
                partnerId: partner.id,
                deviceModelId: model.id,
              },
            },
          }),
          tx.hardwareRegistry.findUnique({
            where: { identifier: dto.identifier },
          }),
        ]);

        if (!quota || !quota.isActive) {
          throw new BadRequestException('device.error.quotaInactive');
        }

        let hardware = existingHardware;

        if (hardware) {
          const oldDevice = await tx.device.findUnique({
            where: {
              identifier_protocol: {
                identifier: dto.identifier,
                protocol: dto.protocol,
              },
            },
          });

          if (oldDevice) {
            redisCleanup = {
              oldToken: oldDevice.token,
              oldDeviceId: oldDevice.id,
            };
            await tx.device.delete({
              where: { id: oldDevice.id },
            });
          }

          hardware = await tx.hardwareRegistry.update({
            where: { id: hardware.id },
            data: {
              deviceToken: newDeviceToken,
              activatedAt: new Date(),
              partnerId: partner.id,
              deviceModelId: model.id,
            },
          });
        } else {
          // Check quota limit for new hardware
          if (quota.activatedCount >= quota.maxQuantity) {
            throw new BadRequestException('device.error.quotaExceeded');
          }

          // Increment activated count
          await tx.licenseQuota.update({
            where: { id: quota.id },
            data: { activatedCount: { increment: 1 } },
          });

          hardware = await tx.hardwareRegistry.create({
            data: {
              identifier: dto.identifier,
              deviceToken: newDeviceToken,
              partnerId: partner.id,
              deviceModelId: model.id,
              mqttBroker: mqttHost,
            },
          });
        }

        // ─── Parse entities from DeviceModel.config (Blueprint) ───
        const rawEntities = this.extractEntities(model.config);

        const entitiesToCreate = rawEntities.map(
          (e: IBlueprintEntity, idx: number) => ({
            code: e.code,
            name: e.name,
            domain: e.domain as EntityDomain,
            commandKey: (e.commandKey ?? e.command_key ?? null) as
              | string
              | null,
            commandSuffix: (e.commandSuffix ?? e.command_suffix ?? 'set') as
              | string
              | null,
            readOnly: (e.readOnly ?? e.read_only ?? false) as boolean,
            sortOrder: idx,
            attributes: {
              create: ((e.attributes ?? []) as IBlueprintAttribute[]).map(
                (a) => ({
                  key: a.key as string,
                  name: a.name as string,
                  valueType: (a.valueType ??
                    a.value_type ??
                    'STRING') as AttributeValueType,
                  min: (a.min ?? null) as number | null,
                  max: (a.max ?? null) as number | null,
                  unit: (a.unit ?? null) as string | null,
                  readOnly: (a.readOnly ?? a.read_only ?? false) as boolean,
                  enumValues: (a.enumValues ?? a.enum_values ?? []) as string[],
                  config: (a.config ?? {}) as Prisma.InputJsonValue,
                }),
              ),
            },
          }),
        );

        const newDevice = await tx.device.create({
          data: {
            name: dto.name,
            token: newDeviceToken,
            identifier: dto.identifier,
            protocol: dto.protocol,
            partner: { connect: { id: partner.id } },
            deviceModel: { connect: { id: model.id } },
            hardware: { connect: { id: hardware.id } },
            owner: { connect: { id: userId } },
            home: dto.homeId ? { connect: { id: dto.homeId } } : undefined,
            room: dto.roomId ? { connect: { id: dto.roomId } } : undefined,
            entities: { create: entitiesToCreate },
          },
          include: {
            entities: {
              include: { attributes: true },
              orderBy: { sortOrder: 'asc' },
            },
          },
        });

        // License days are already queried above

        return {
          device: {
            id: newDevice.id,
            name: newDevice.name,
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            entities: (newDevice as any).entities,
          },
          mqtt_broker: mqttHost,
          mqtt_token_device: newDeviceToken,
          // Unique per-device credentials — safer than shared superuser
          mqtt_username: `device_${newDeviceToken}`,
          mqtt_pass: newDeviceToken,
          license_days: quota?.licenseDays ?? 90,
        };
      },
      { timeout: 15000 },
    );

    // Redis cleanup SAU khi transaction DB đã commit thành công
    if (redisCleanup.oldToken || redisCleanup.oldDeviceId) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const cleanupTasks: Promise<any>[] = [];

      if (redisCleanup.oldToken) {
        cleanupTasks.push(
          this.redisService
            .del(`status:${redisCleanup.oldToken}`)
            .catch(() => undefined),
          this.redisService
            .del(`shadow:${redisCleanup.oldToken}`)
            .catch(() => undefined),
        );
      }

      if (redisCleanup.oldDeviceId) {
        // Updated Redis key convention: _ekeys instead of _fkeys
        const trackingKey = `device:${redisCleanup.oldDeviceId}:_ekeys`;
        cleanupTasks.push(
          this.redisService
            .smembers(trackingKey)
            .then((keys) =>
              keys.length > 0
                ? this.redisService.del([...keys, trackingKey])
                : this.redisService.del(trackingKey),
            )
            .catch(() => undefined),
        );
      }

      await Promise.all(cleanupTasks);
    }

    return result;
  }
}
