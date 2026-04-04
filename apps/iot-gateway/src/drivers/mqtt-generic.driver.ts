import { Injectable, Logger } from '@nestjs/common';
import { MqttService } from '@app/common/mqtt/mqtt.service';
import { IDeviceDriver } from '../interfaces/device-driver.interface';
import { DeviceEntity } from '@prisma/client';

@Injectable()
export class MqttGenericDriver implements IDeviceDriver {
  name = 'mqtt';
  private readonly logger = new Logger(MqttGenericDriver.name);

  constructor(private mqttService: MqttService) {}

  async setValue(device: any, entity: any, value: any): Promise<boolean> {
    try {
      const suffix = entity.commandSuffix ?? 'set';
      const topic = `device/${device.token}/${suffix}`;

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

  async setValueBulk(device: any, entities: DeviceEntity[]): Promise<boolean> {
    try {
      if (entities.length === 0) return true;

      const suffix = (entities[0] as any).commandSuffix ?? 'set';
      const topic = `device/${device.token}/${suffix}`;

      const payload: Record<string, any> = {};
      for (const entity of entities as any[]) {
        if (entity.commandKey) {
          payload[entity.commandKey] = entity.state ?? entity.stateText ?? '';
        }
      }

      await this.mqttService.publish(topic, JSON.stringify(payload), {
        qos: 1,
      });
      return true;
    } catch (error) {
      this.logger.error(
        `Failed to set value bulk for device ${device.token}: ${error.message}`,
      );
      return false;
    }
  }
}
