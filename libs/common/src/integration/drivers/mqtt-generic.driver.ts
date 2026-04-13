import { Injectable, Logger } from '@nestjs/common';
import { MqttService } from '../../mqtt/mqtt.service';
import { IDeviceDriver } from '../interfaces/device-driver.interface';
import { DeviceEntity } from '@prisma/client';

@Injectable()
export class MqttGenericDriver implements IDeviceDriver {
  name = 'mqtt';
  private readonly logger = new Logger(MqttGenericDriver.name);

  // Expose mqttService so executor can do direct lean publish with compiled topics
  readonly mqttService: MqttService;

  constructor(mqttService: MqttService) {
    this.mqttService = mqttService;
  }

  /**
   * Gửi lệnh điều khiển 1 entity.
   * Entity đã chứa commandKey/commandSuffix trực tiếp → không cần lookup từ featuresConfig.
   */
  async setValue(device: any, entity: any, value: any): Promise<boolean> {
    try {
      const suffix = (entity.commandSuffix ?? 'set').replace(/^\//, '');
      const topic = `device/${device.token}/${suffix}`;

      let payloadStr = '';
      if (entity.commandKey) {
        payloadStr = JSON.stringify({ [entity.commandKey]: value });
      } else {
        payloadStr = JSON.stringify(value);
      }

      await this.mqttService.publish(topic, payloadStr, { qos: 1 });
      return true;
    } catch (error: unknown) {
      this.logger.error(
        `Failed to set value for device ${device.token}, entity ${entity.code}: ${error instanceof Error ? error.message : String(error)}`,
      );
      return false;
    }
  }

  /**
   * Gửi lệnh bulk cho nhiều entities cùng 1 device.
   * [SCENE SCALING FIX] Group entities theo commandSuffix trước khi publish
   * để tránh gửi nhầm topic khi các entities dùng suffix khác nhau.
   */
  async setValueBulk(device: any, entities: DeviceEntity[]): Promise<boolean> {
    try {
      if (entities.length === 0) return true;

      // Group by commandSuffix — mỗi suffix là 1 MQTT message riêng
      const bySuffix = new Map<string, DeviceEntity[]>();
      for (const entity of entities) {
        const suffix = ((entity as any).commandSuffix ?? 'set').replace(
          /^\//,
          '',
        );
        const group = bySuffix.get(suffix) ?? [];
        group.push(entity);
        bySuffix.set(suffix, group);
      }

      for (const [suffix, group] of bySuffix) {
        const topic = `device/${device.token}/${suffix}`;
        const payload: Record<string, any> = {};
        for (const entity of group as any[]) {
          if (entity.commandKey) {
            payload[entity.commandKey] = entity.state ?? entity.stateText ?? '';
          }
        }
        await this.mqttService.publish(topic, JSON.stringify(payload), {
          qos: 1,
        });
      }

      return true;
    } catch (error: unknown) {
      this.logger.error(
        `Failed to set value bulk for device ${device.token}: ${error instanceof Error ? error.message : String(error)}`,
      );
      return false;
    }
  }

  /**
   * Gửi raw payload đến device command topic (không cần entity).
   * Topic: device/{token}/set
   * Dùng cho: unbind, OTA URL, system commands...
   */
  async publishRaw(
    device: any,
    payload: Record<string, any>,
  ): Promise<boolean> {
    try {
      const topic = `device/${device.token}/set`;
      await this.mqttService.publish(topic, JSON.stringify(payload), {
        qos: 1,
      });
      return true;
    } catch (error: any) {
      this.logger.error(
        `Failed publishRaw to ${device.token}: ${error?.message}`,
      );
      return false;
    }
  }
}
