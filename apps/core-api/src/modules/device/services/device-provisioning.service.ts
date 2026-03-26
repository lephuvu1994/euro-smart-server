import { Injectable, BadRequestException } from '@nestjs/common';
import { DatabaseService } from '@app/database';
import { RedisService } from '@app/redis-cache';
import { RegisterDeviceDto } from '../dto/register-device.dto';
import { v4 as uuidv4 } from 'uuid';

/**
 * Blueprint v2 entity format (from DeviceModel.config):
 * {
 *   "entities": [
 *     {
 *       "code": "channel_1",
 *       "name": "Kênh 1",
 *       "domain": "light",
 *       "commandKey": "state",
 *       "commandSuffix": "set",
 *       "readOnly": false,
 *       "attributes": [
 *         { "key": "brightness", "name": "Độ sáng", "valueType": "NUMBER", "min": 0, "max": 100, "unit": "%" },
 *         { "key": "color_temp", "name": "Nhiệt độ màu", "valueType": "NUMBER", "min": 2700, "max": 6500, "unit": "K" }
 *       ]
 *     }
 *   ]
 * }
 */

@Injectable()
export class DeviceProvisioningService {
  constructor(
    private readonly databaseService: DatabaseService,
    private readonly redisService: RedisService,
  ) {}

  // ─── App trực tiếp register (flow BLE/Provision Token) ───────
  async registerAndClaim(userId: string, dto: RegisterDeviceDto) {
    if (!userId) throw new BadRequestException('device.error.invalidUser');

    const [model, partner] = await Promise.all([
      this.databaseService.deviceModel.findUnique({
        where: { code: dto.deviceCode },
      }),
      this.databaseService.partner.findUnique({
        where: { code: dto.partnerCode },
      }),
    ]);

    if (!model || !partner)
      throw new BadRequestException('device.error.invalidModelOrPartner');

    // Thu thập thông tin cần cleanup Redis (sẽ thực hiện SAU transaction)
    let redisCleanup: { oldToken?: string; oldDeviceId?: string } = {};

    const result = await this.databaseService.$transaction(
      async (tx) => {
        const newDeviceToken = uuidv4();

        let hardware = await tx.hardwareRegistry.findUnique({
          where: { identifier: dto.identifier },
        });

        if (hardware) {
          const oldDevice = await tx.device.findUnique({
            where: { 
              identifier_protocol: { 
                identifier: dto.identifier,
                protocol: dto.protocol
              } 
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
          hardware = await tx.hardwareRegistry.create({
            data: {
              identifier: dto.identifier,
              deviceToken: newDeviceToken,
              partnerId: partner.id,
              deviceModelId: model.id,
              mqttBroker: process.env.MQTT_HOST_PUBLIC || 'localhost',
            },
          });
        }

        // ─── Blueprint v2: parse entities from DeviceModel.config ───
        // Supports both formats:
        //   - Object: { entities: [...] }
        //   - Array:  [{ code, name, domain, ... }]
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const blueprint = model.config as any;
        const rawEntities = Array.isArray(blueprint)
          ? blueprint
          : (blueprint?.entities ?? []);

        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const entitiesToCreate = rawEntities.map((e: any, idx: number) => ({
          code: e.code,
          name: e.name,
          domain: e.domain,
          commandKey: e.commandKey ?? e.command_key ?? null,
          commandSuffix: e.commandSuffix ?? e.command_suffix ?? 'set',
          readOnly: e.readOnly ?? e.read_only ?? false,
          sortOrder: idx,
          attributes: {
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            create: (e.attributes ?? []).map((a: any) => ({
              key: a.key,
              name: a.name,
              valueType: a.valueType ?? a.value_type ?? 'STRING',
              min: a.min ?? null,
              max: a.max ?? null,
              unit: a.unit ?? null,
              readOnly: a.readOnly ?? a.read_only ?? false,
              enumValues: a.enumValues ?? a.enum_values ?? [],
              config: a.config ?? {},
            })),
          },
        }));

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

        // Query license days from quota
        const quota = await tx.licenseQuota.findUnique({
          where: {
            partnerId_deviceModelId: {
              partnerId: partner.id,
              deviceModelId: model.id,
            },
          },
          select: { licenseDays: true },
        });

        return {
          device: {
            id: newDevice.id,
            name: newDevice.name,
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            entities: (newDevice as any).entities,
          },
          mqtt_broker: process.env.MQTT_HOST,
          mqtt_token_device: newDeviceToken,
          mqtt_username: process.env.MQTT_USER,
          mqtt_pass: process.env.MQTT_PASS,
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
