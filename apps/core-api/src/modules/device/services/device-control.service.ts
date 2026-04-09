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
   * Kiểm tra quyền sở hữu hoặc chia sẻ device.
   * Owner luôn có full quyền. DeviceShare kiểm tra role:
   * - ADMIN/EDITOR: điều khiển được
   * - VIEWER: chỉ xem (trả về false cho control operations)
   */
  async checkUserPermission(
    deviceToken: string,
    userId: string,
    requireControl = false,
  ): Promise<boolean> {
    const device = await this.databaseService.device.findFirst({
      where: { token: deviceToken },
      include: {
        sharedUsers: {
          where: { userId },
        },
      },
    });
    if (!device) return false;

    // Owner always has full access
    if (device.ownerId === userId) return true;

    // Check shared access
    const share = device.sharedUsers?.[0];
    if (!share) return false;

    // VIEWER can only read, not control
    if (requireControl && share.permission === 'VIEWER') return false;

    return true;
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

    // Check online status via dedicated status key (set by iot-gateway on connect/disconnect)
    const statusValue = await this.redisService.get(`status:${device.token}`);

    if (statusValue !== 'online') {
      throw new HttpException(
        'Thiết bị đang ngoại tuyến',
        HttpStatus.SERVICE_UNAVAILABLE,
      );
    }

    // Validate position limit: block redundant OPEN/CLOSE when curtain already at limit
    if (value === 'OPEN' || value === 'CLOSE') {
      const shadow = await this.redisService.hgetall(`device:shadow:${device.token}`);
      const pos = shadow?.position !== undefined ? Number(shadow.position) : null;
      if (pos !== null && !Number.isNaN(pos)) {
        if (value === 'CLOSE' && pos <= 0) {
          throw new BadRequestException('device.error.alreadyClosed');
        }
        if (value === 'OPEN' && pos >= 100) {
          throw new BadRequestException('device.error.alreadyOpen');
        }
      }
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
        issuedAt: Date.now(),
      },
      {
        priority: 1,
        attempts: 1,       // No retry for real-time control — stale commands are harmful
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

    // Check online status via dedicated status key (set by iot-gateway on connect/disconnect)
    const statusValue = await this.redisService.get(`status:${device.token}`);

    if (statusValue !== 'online') {
      throw new HttpException(
        'Thiết bị đang ngoại tuyến',
        HttpStatus.SERVICE_UNAVAILABLE,
      );
    }

    // Validate position limit for bulk curtain commands
    const curtainCmds = values.filter(v => v.value === 'OPEN' || v.value === 'CLOSE');
    if (curtainCmds.length > 0) {
      const shadow = await this.redisService.hgetall(`device:shadow:${device.token}`);
      const pos = shadow?.position !== undefined ? Number(shadow.position) : null;
      if (pos !== null && !Number.isNaN(pos)) {
        for (const v of curtainCmds) {
          if (v.value === 'CLOSE' && pos <= 0) {
            throw new BadRequestException('device.error.alreadyClosed');
          }
          if (v.value === 'OPEN' && pos >= 100) {
            throw new BadRequestException('device.error.alreadyOpen');
          }
        }
      }
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
        issuedAt: Date.now(),
      },
      {
        priority: 1,
        attempts: 1,       // No retry for real-time control — stale commands are harmful
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
  private validateEntityValue(
    domain: string,
    value: string | number | boolean,
  ) {
    switch (domain) {
      case 'switch':
      case 'switch_':
        if (
          value !== 0 &&
          value !== 1 &&
          value !== true &&
          value !== false &&
          value !== 'on' &&
          value !== 'off'
        ) {
          throw new BadRequestException(
            'Giá trị switch phải là 0/1, true/false, hoặc on/off',
          );
        }
        break;

      case 'button':
        // Trigger action: string command (e.g. RF learn: 'open'/'close') hoặc 1/true
        if (typeof value !== 'string' && value !== 1 && value !== true)
          throw new BadRequestException(
            'Giá trị button phải là string hoặc 1/true',
          );
        break;

      case 'light':
        if (typeof value === 'number' && (value < 0 || value > 100)) {
          throw new BadRequestException('device.error.invalidLightValue');
        }
        break;

      case 'curtain': {
        const allowed = ['OPEN', 'CLOSE', 'STOP', 'DIR_REV', 'DIR_FWD'];
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
        if (
          typeof value !== 'object' ||
          value === null ||
          Array.isArray(value)
        ) {
          throw new BadRequestException('Giá trị config phải là object');
        }
        break;

      case 'update':
        if (typeof value !== 'string' || !value.startsWith('http')) {
          throw new BadRequestException(
            'Giá trị update (OTA) phải là HTTP/HTTPS URL',
          );
        }
        break;

      case 'sensor':
        throw new BadRequestException(
          'Sensor là read-only, không thể điều khiển',
        );
    }
  }

  async getShadowState(token: string) {
    return await this.redisService.hgetall(`device:shadow:${token}`);
  }
}
