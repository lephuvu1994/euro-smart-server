import {
    Injectable,
    HttpException,
    HttpStatus,
    UnauthorizedException,
    NotFoundException,
    BadRequestException,
} from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { APP_BULLMQ_QUEUES } from '@app/common';
import { RedisService } from '@app/redis-cache';
import { DatabaseService } from '@app/database';
import { DEVICE_JOBS } from '@app/common';

// 1. Định nghĩa Interface cho Config JSON (để bỏ 'any')
interface DeviceFeatureConfig {
    commandSuffix?: string;
    commandKey?: string;
    embeddedKeys?: string[];
    values?: string[];
}

@Injectable()
export class DeviceControlService {
    constructor(
        @InjectQueue(APP_BULLMQ_QUEUES.DEVICE_CONTROL)
        private deviceQueue: Queue,
        private readonly redisService: RedisService,
        private readonly databaseService: DatabaseService
    ) {}

    /**
     * Hàm kiểm tra quyền sở hữu (Có thể gọi từ Controller hoặc nội bộ)
     */
    async checkUserPermission(
        deviceId: string,
        userId: string
    ): Promise<boolean> {
        const device = await this.databaseService.device.findFirst({
            where: {
                token: deviceId,
                ownerId: userId,
            },
        });
        return !!device;
    }

    async sendControlCommand(
        deviceToken: string,
        userId: string,
        featureCode: string,
        value: any
    ) {
        // 1. Lấy thông tin Device KÈM THEO Partner và Feature
        const device = await this.databaseService.device.findFirst({
            where: { token: deviceToken, ownerId: userId },
            include: {
                partner: { select: { code: true } },
                features: true,
            },
        });

        if (!device) {
            throw new UnauthorizedException(
                'Thiết bị không tồn tại hoặc không có quyền'
            );
        }

        // 2. Validate Feature
        const feature = device.features.find(f => f.code === featureCode);
        if (!feature) {
            throw new NotFoundException(
                `Tính năng '${featureCode}' không tồn tại`
            );
        }

        if (feature.readOnly) {
            throw new BadRequestException('Tính năng này chỉ đọc (Read-only)');
        }

        // [MỚI] 3. Validate Dữ liệu đầu vào (Tránh gửi rác xuống thiết bị)
        this.validateFeatureValue(
            feature.type,
            value,
            feature.config as DeviceFeatureConfig
        );

        const isOnline = await this.redisService.hget(
            `device:shadow:${device.token}`,
            'online'
        );

        if (!isOnline) {
            throw new HttpException(
                'Thiết bị đang ngoại tuyến',
                HttpStatus.SERVICE_UNAVAILABLE
            );
        }

        // 5. Chuẩn bị Payload cho Queue
        // Ép kiểu config sang Interface đã định nghĩa
        const featureConfig = feature.config as any as DeviceFeatureConfig;

        const mqttPayload = {
            partnerCode: device.partner.code,
            token: device.token,
            // Nếu không có suffix trong DB, dùng mặc định 'set'
            commandSuffix: featureConfig.commandSuffix || 'set',
            featureCode: featureCode,

            featureType: feature.type,
            // Nếu không có command_key, dùng mặc định 'state'
            commandKey: featureConfig.commandKey || 'state',
            embeddedKeys: featureConfig.embeddedKeys || [],

            value: value,
        };

        // 6. Đẩy Job vào Queue
        await this.deviceQueue.add(DEVICE_JOBS.CONTROL_CMD, mqttPayload, {
            priority: 1,
            attempts: 3,
            backoff: 5000,
            removeOnComplete: true,
        });

        // [MỚI] 7. (Optional) Cập nhật Optimistic Shadow
        // Cập nhật tạm thời vào Redis để UI thấy phản hồi ngay (trước khi thiết bị thật phản hồi)
        // await this.redisService.hset(`shadow:${device.token}`, featureCode, JSON.stringify(value));

        return {
            status: 'queued',
            deviceToken,
            featureCode,
            value,
            timestamp: new Date(),
        };
    }

    async sendDeviceValueCommand(
        deviceToken: string,
        userId: string,
        value: { code: string; value: any }[]
    ) {
        // 1. Lấy thông tin Device KÈM THEO Partner và Feature
        const device = await this.databaseService.device.findFirst({
            where: { token: deviceToken, ownerId: userId },
            include: {
                partner: { select: { code: true } },
                features: true,
            },
        });

        if (!device) {
            throw new UnauthorizedException(
                'Thiết bị không tồn tại hoặc không có quyền'
            );
        }

        const isOnline = await this.redisService.hget(
            `device:shadow:${device.token}`,
            'online'
        );

        if (!isOnline) {
            throw new HttpException(
                'Thiết bị đang ngoại tuyến',
                HttpStatus.SERVICE_UNAVAILABLE
            );
        }

        // 5. Lấy tất cả các feature của thiết bị
        const features = await this.databaseService.deviceFeature.findMany({
            where: { deviceId: device.id },
        });

        // 6. Chuẩn bị Payload cho Queue
        // Ép kiểu config sang Interface đã định nghĩa
        const featureMQTTPayloads = features
            .filter(
                f =>
                    !f.readOnly &&
                    (f.config as DeviceFeatureConfig).commandSuffix === 'set'
            )
            .map(f => {
                const config = f.config as DeviceFeatureConfig;
                const featureValue = value.find(v => v.code === f.code);
                if (!featureValue) {
                    throw new BadRequestException(
                        `Giá trị cho feature ${f.code} không tồn tại`
                    );
                }
                this.validateFeatureValue(f.type, featureValue.value, config);
                return {
                    partnerCode: device.partner.code,
                    token: device.token,
                    // Nếu không có suffix trong DB, dùng mặc định 'set'
                    commandSuffix: config.commandSuffix || 'set',
                    featureCode: f.code,

                    featureType: f.type,
                    // Nếu không có command_key, dùng mặc định 'state'
                    commandKey: config.commandKey || 'state',
                    embeddedKeys: config.embeddedKeys || [],
                    value: featureValue.value,
                };
            });

        // 6. Đẩy Job vào Queue
        await this.deviceQueue.add(
            DEVICE_JOBS.CONTROL_DEVICE_VALUE_CMD,
            featureMQTTPayloads,
            {
                priority: 1,
                attempts: 3,
                backoff: 5000,
                removeOnComplete: true,
            }
        );

        // [MỚI] 7. (Optional) Cập nhật Optimistic Shadow
        // Cập nhật tạm thời vào Redis để UI thấy phản hồi ngay (trước khi thiết bị thật phản hồi)
        await this.redisService.hset(
            `device:shadow:${device.token}`,
            'device_value',
            JSON.stringify(value)
        );

        return {
            status: 'queued',
            deviceToken,
            value,
            timestamp: new Date(),
        };
    }

    /**
     * Hàm Validate dữ liệu dựa trên Feature Type
     */
    private validateFeatureValue(
        type: string,
        value: any,
        config: DeviceFeatureConfig
    ) {
        switch (type) {
            case 'BINARY': // 0 hoặc 1, true hoặc false
                if (
                    value !== 0 &&
                    value !== 1 &&
                    value !== true &&
                    value !== false
                ) {
                    throw new BadRequestException(
                        'Giá trị BINARY phải là 0/1 hoặc true/false'
                    );
                }
                break;
            case 'DIMMER': // 0 -> 100
                if (typeof value !== 'number' || value < 0 || value > 100) {
                    throw new BadRequestException(
                        'Giá trị DIMMER phải từ 0 đến 100'
                    );
                }
                break;
            case 'SHUTTER': // Phải nằm trong danh sách cho phép (OPEN, CLOSE, STOP)
                const allowedValues = config.values || [
                    'OPEN',
                    'CLOSE',
                    'STOP',
                ];
                if (!allowedValues.includes(value)) {
                    throw new BadRequestException(
                        `Giá trị SHUTTER không hợp lệ. Cho phép: ${allowedValues.join(', ')}`
                    );
                }
                break;
            case 'COLOR': // Kiểm tra Hex hoặc RGB (đơn giản check string)
                if (typeof value !== 'string') {
                    throw new BadRequestException(
                        'Giá trị COLOR phải là chuỗi'
                    );
                }
                break;
            case 'CONFIG': // Phải là Object
                if (typeof value !== 'object') {
                    throw new BadRequestException(
                        'Giá trị CONFIG phải là JSON Object'
                    );
                }
                break;
            // Các case khác (BUTTON, TEXT...) có thể bỏ qua hoặc validate tùy ý
        }
    }

    async getShadowState(token: string) {
        return await this.redisService.hgetall(`shadow:${token}`);
    }
}
