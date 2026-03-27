import { Injectable, Logger } from '@nestjs/common';
import { MqttService } from '../../mqtt/mqtt.service';
import { IDeviceDriver } from '../interfaces/device-driver.interface';
import { DeviceEntity } from '@prisma/client';

@Injectable()
export class MqttGenericDriver implements IDeviceDriver {
  name = 'mqtt';
  private readonly logger = new Logger(MqttGenericDriver.name);

  constructor(private mqttService: MqttService) {}

  /**
   * Gửi lệnh điều khiển 1 entity.
   * Entity đã chứa commandKey/commandSuffix trực tiếp → không cần lookup từ featuresConfig.
   */
  async setValue(device: any, entity: any, value: any): Promise<boolean> {
    try {
      const suffix = (entity.commandSuffix ?? 'set').replace(/^\//, '');
      const topic = `${device.partner.code}/${device.deviceModel.code}/${device.token}/${suffix}`;

      let payloadStr = '';
      if (entity.commandKey) {
        payloadStr = JSON.stringify({ [entity.commandKey]: value });
      } else {
        payloadStr = JSON.stringify(value);
      }

      await this.mqttService.publish(topic, payloadStr, { qos: 1 });
      return true;
    } catch (error) {
      this.logger.error(
        `Failed to set value for device ${device.token}, entity ${entity.code}: ${error.message}`,
      );
      return false;
    }
  }

  /**
   * Gửi lệnh bulk cho nhiều entities cùng 1 device.
   * Gộp nhiều entity values vào 1 MQTT message.
   */
  async setValueBulk(device: any, entities: DeviceEntity[]): Promise<boolean> {
    try {
      if (entities.length === 0) return true;

      // Dùng commandSuffix của entity đầu tiên (bulk thường cùng suffix)
      const suffix = ((entities[0] as any).commandSuffix ?? 'set').replace(/^\//, '');
      const topic = `${device.partner.code}/${device.deviceModel.code}/${device.token}/${suffix}`;

      // Gộp payload: { commandKey1: value1, commandKey2: value2, ... }
      const payload: Record<string, any> = {};
      for (const entity of entities as any[]) {
        if (entity.commandKey) {
          payload[entity.commandKey] = entity.state ?? entity.stateText ?? '';
        }
      }

      const payloadStr = JSON.stringify(payload);
      await this.mqttService.publish(topic, payloadStr, { qos: 1 });
      return true;
    } catch (error) {
      this.logger.error(
        `Failed to set value bulk for device ${device.token}: ${error.message}`,
      );
      return false;
    }
  }
}
