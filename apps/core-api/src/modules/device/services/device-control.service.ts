import {
  Injectable,
  HttpException,
  HttpStatus,
  ForbiddenException,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { APP_BULLMQ_QUEUES } from '@app/common';
import { RedisService } from '@app/redis-cache';
import { DatabaseService } from '@app/database';
import { DEVICE_JOBS } from '@app/common';

@Injectable()
export class DeviceControlService {
  constructor(
    @InjectQueue(APP_BULLMQ_QUEUES.DEVICE_CONTROL)
    private deviceQueue: Queue,
    private readonly redisService: RedisService,
    private readonly databaseService: DatabaseService,
  ) {}

  /**
   * Kiểm tra quyền sở hữu device
   */
  async checkUserPermission(
    deviceToken: string,
    userId: string,
  ): Promise<boolean> {
    const device = await this.databaseService.device.findFirst({
      where: { token: deviceToken, ownerId: userId },
    });
    return !!device;
  }

  /**
   * Gửi lệnh điều khiển 1 entity của device
   */
  async sendControlCommand(
    deviceToken: string,
    userId: string,
    entityCode: string,
    value: string | number | boolean,
  ) {
    const device = await this.databaseService.device.findFirst({
      where: { token: deviceToken, ownerId: userId },
      include: {
        partner: { select: { code: true } },
        entities: true,
      },
    });

    if (!device) {
      throw new ForbiddenException(
        'Thiết bị không tồn tại hoặc không có quyền',
      );
    }

    const entity = device.entities.find((e) => e.code === entityCode);
    if (!entity) {
      throw new NotFoundException(`Entity '${entityCode}' không tồn tại`);
    }

    if (entity.readOnly) {
      throw new BadRequestException('device.error.readOnlyEntity');
    }

    // Validate value theo entity domain
    this.validateEntityValue(entity.domain, value);

    const isOnline = await this.redisService.hget(
      `device:shadow:${device.token}`,
      'online',
    );

    if (!isOnline) {
      throw new HttpException(
        'Thiết bị đang ngoại tuyến',
        HttpStatus.SERVICE_UNAVAILABLE,
      );
    }

    // Đẩy job vào Queue — entity mang đầy đủ config (commandKey, commandSuffix)
    await this.deviceQueue.add(
      DEVICE_JOBS.CONTROL_CMD,
      {
        token: device.token,
        entityCode,
        value,
        userId,
        source: 'app',
      },
      {
        priority: 1,
        attempts: 3,
        backoff: 5000,
        removeOnComplete: true,
      },
    );

    return {
      status: 'queued',
      deviceToken,
      entityCode,
      value,
      timestamp: new Date(),
    };
  }

  /**
   * Gửi lệnh bulk cho nhiều entities cùng 1 device
   */
  async sendDeviceValueCommand(
    deviceToken: string,
    userId: string,
    values: { entityCode: string; value: string | number | boolean }[],
  ) {
    const device = await this.databaseService.device.findFirst({
      where: { token: deviceToken, ownerId: userId },
      include: {
        partner: { select: { code: true } },
        entities: true,
      },
    });

    if (!device) {
      throw new ForbiddenException(
        'Thiết bị không tồn tại hoặc không có quyền',
      );
    }

    const isOnline = await this.redisService.hget(
      `device:shadow:${device.token}`,
      'online',
    );

    if (!isOnline) {
      throw new HttpException(
        'Thiết bị đang ngoại tuyến',
        HttpStatus.SERVICE_UNAVAILABLE,
      );
    }

    // Build entity MQTT payloads
    const entityPayloads = values.map((v) => {
      const entity = device.entities.find((e) => e.code === v.entityCode);
      if (!entity) {
        throw new BadRequestException(`Entity '${v.entityCode}' không tồn tại`);
      }
      if (entity.readOnly) {
        throw new BadRequestException(
          `Entity '${v.entityCode}' chỉ đọc (Read-only)`,
        );
      }
      this.validateEntityValue(entity.domain, v.value);
      return {
        entityCode: entity.code,
        value: v.value,
      };
    });

    await this.deviceQueue.add(
      DEVICE_JOBS.CONTROL_DEVICE_VALUE_CMD,
      {
        token: device.token,
        entityPayloads,
        userId,
        source: 'app',
      },
      {
        priority: 1,
        attempts: 3,
        backoff: 5000,
        removeOnComplete: true,
      },
    );

    return {
      status: 'queued',
      deviceToken,
      values,
      timestamp: new Date(),
    };
  }

  /**
   * Validate giá trị dựa trên EntityDomain
   */
  private validateEntityValue(domain: string, value: string | number | boolean) {
    switch (domain) {
      case 'switch':
      case 'switch_':
        if (value !== 0 && value !== 1 && value !== true && value !== false && value !== 'on' && value !== 'off') {
          throw new BadRequestException('Giá trị switch phải là 0/1, true/false, hoặc on/off');
        }
        break;

      case 'button':
        // Trigger action: string command (e.g. RF learn: 'open'/'close') hoặc 1/true
        if (typeof value !== 'string' && value !== 1 && value !== true)
          throw new BadRequestException('Giá trị button phải là string hoặc 1/true');
        break;

      case 'light':
        if (typeof value === 'number' && (value < 0 || value > 100)) {
          throw new BadRequestException('device.error.invalidLightValue');
        }
        break;

      case 'curtain': {
        const allowed = ['OPEN', 'CLOSE', 'STOP'];
        if (typeof value === 'string' && !allowed.includes(value)) {
          throw new BadRequestException(
            `Giá trị curtain không hợp lệ. Cho phép: ${allowed.join(', ')}`,
          );
        }
        break;
      }

      case 'lock':
        // child_lock: chip nhận number 0 hoặc 1
        if (value !== 0 && value !== 1) {
          throw new BadRequestException('Giá trị lock phải là 0 hoặc 1');
        }
        break;

      case 'config':
        // Pass-through: server không validate nội dung, chip tự xử lý
        if (typeof value !== 'object' || value === null || Array.isArray(value)) {
          throw new BadRequestException('Giá trị config phải là object');
        }
        break;


      case 'update':
        if (typeof value !== 'string' || !value.startsWith('http')) {
          throw new BadRequestException('Giá trị update (OTA) phải là HTTP/HTTPS URL');
        }
        break;

      case 'sensor':
        throw new BadRequestException('Sensor là read-only, không thể điều khiển');
    }
  }

  async getShadowState(token: string) {
    return await this.redisService.hgetall(`shadow:${token}`);
  }
}
