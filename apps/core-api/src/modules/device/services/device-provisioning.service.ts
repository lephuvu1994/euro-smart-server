import { Injectable, BadRequestException } from '@nestjs/common';
import { DatabaseService } from '@app/database';
import { RedisService } from '@app/redis-cache';
import { RegisterDeviceDto } from '../dto/register-device.dto';
import { v4 as uuidv4 } from 'uuid';

@Injectable()
export class DeviceProvisioningService {
    constructor(
        private readonly databaseService: DatabaseService,
        private readonly redisService: RedisService
    ) {}

    // ─── EXISTING: App trực tiếp register (flow BLE cũ) ───────
    async registerAndClaim(userId: string, dto: RegisterDeviceDto) {
        if (!userId) throw new BadRequestException('User không hợp lệ');

        const [model, partner] = await Promise.all([
            this.databaseService.deviceModel.findUnique({
                where: { code: dto.deviceCode },
            }),
            this.databaseService.partner.findUnique({
                where: { code: dto.partnerCode },
            }),
        ]);

        if (!model || !partner)
            throw new BadRequestException('Model hoặc Partner không hợp lệ');

        // Thu thập thông tin cần cleanup Redis (sẽ thực hiện SAU transaction)
        let redisCleanup: { oldToken?: string; oldDeviceId?: string } = {};

        const result = await this.databaseService.$transaction(
            async tx => {
                const newDeviceToken = uuidv4();

                let hardware = await tx.hardwareRegistry.findUnique({
                    where: { identifier: dto.identifier },
                });

                if (hardware) {
                    const oldDevice = await tx.device.findUnique({
                        where: { hardwareId: hardware.id },
                    });

                    if (oldDevice) {
                        // Lưu lại info để cleanup Redis sau transaction
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
                            mqttBroker:
                                process.env.MQTT_HOST_PUBLIC || 'localhost',
                        },
                    });
                }

                const modelConfig = (model.featuresConfig as any) || {};
                const featuresToCreate = (modelConfig.features || []).map(f => {
                    const featureMetaConfig = {
                        commandKey: f.commandKey || null,
                        embeddedKeys: f.embeddedKeys || [],
                        values: f.values || [],
                    };

                    return {
                        code: f.code,
                        name: f.name,
                        type: f.type,
                        readOnly: f.readOnly || false,
                        category: f.category || 'switch',
                        lastValue: null,
                        lastValueString: '{}',
                        config: featureMetaConfig,
                    };
                });

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
                        home: dto.homeId
                            ? { connect: { id: dto.homeId } }
                            : undefined,
                        room: dto.roomId
                            ? { connect: { id: dto.roomId } }
                            : undefined,
                        features: { create: featuresToCreate },
                    },
                    include: { features: true },
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
                        features: newDevice.features,
                    },
                    mqtt_broker: process.env.MQTT_HOST,
                    mqtt_token_device: newDeviceToken,
                    mqtt_username: process.env.MQTT_USER,
                    mqtt_pass: process.env.MQTT_PASS,
                    license_days: quota?.licenseDays ?? 90,
                };
            },
            { timeout: 15000 }
        );

        // Redis cleanup SAU khi transaction DB đã commit thành công
        if (redisCleanup.oldToken || redisCleanup.oldDeviceId) {
            const cleanupTasks: Promise<any>[] = [];

            if (redisCleanup.oldToken) {
                cleanupTasks.push(
                    this.redisService
                        .del(`status:${redisCleanup.oldToken}`)
                        .catch(() => {}),
                    this.redisService
                        .del(`shadow:${redisCleanup.oldToken}`)
                        .catch(() => {})
                );
            }

            if (redisCleanup.oldDeviceId) {
                const trackingKey = `device:${redisCleanup.oldDeviceId}:_fkeys`;
                cleanupTasks.push(
                    this.redisService
                        .smembers(trackingKey)
                        .then(keys =>
                            keys.length > 0
                                ? this.redisService.del([...keys, trackingKey])
                                : this.redisService.del(trackingKey)
                        )
                        .catch(() => {})
                );
            }

            await Promise.all(cleanupTasks);
        }

        return result;
    }
}
