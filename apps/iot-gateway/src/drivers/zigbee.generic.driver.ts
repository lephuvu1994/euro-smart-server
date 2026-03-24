import { Injectable, Logger } from '@nestjs/common';
import { MqttService } from '@app/common/mqtt/mqtt.service';
import { IDeviceDriver } from '../interfaces/device-driver.interface';
import { DeviceEntity } from '@prisma/client';

@Injectable()
export class ZigbeeGenericDriver implements IDeviceDriver {
  name = 'zigbee';
  private readonly logger = new Logger(ZigbeeGenericDriver.name);

  constructor(private mqttService: MqttService) {}

  async setValue(device: any, entity: any, value: any): Promise<boolean> {
    try {
      const entityConfig = entity.config ?? {};

      if (entityConfig.mqtt) {
        const mqttConfig = entityConfig.mqtt;
        const topic = (mqttConfig.topicPattern ?? '')
          .replace('{{partnerCode}}', device.partner.code)
          .replace('{{deviceToken}}', device.token);

        let payloadStr = '';
        if (entity.domain === 'switch_' || entity.domain === 'light') {
          const template = value ? mqttConfig.payloadOn : mqttConfig.payloadOff;
          payloadStr = JSON.stringify(template);
        } else {
          payloadStr = JSON.stringify(
            (mqttConfig.payloadTemplate ?? '').replace?.('{{value}}', value) ?? value,
          );
        }

        await this.mqttService.publish(topic, payloadStr, { qos: 1 });
        return true;
      }

      const suffix = entity.commandSuffix ?? 'set';
      const topic = `${device.partner.code}/${device.deviceModel.code}/${device.token}/${suffix}`;
      const payloadStr = entity.commandKey
        ? JSON.stringify({ [entity.commandKey]: value })
        : JSON.stringify(value);

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

      const firstEntity = entities[0] as any;
      const suffix = firstEntity.commandSuffix ?? 'set';
      const topic = `${device.partner.code}/${device.deviceModel.code}/${device.token}/${suffix}`;

      const payload: Record<string, any> = {};
      for (const entity of entities as any[]) {
        if (entity.commandKey) {
          payload[entity.commandKey] = entity.state ?? entity.stateText ?? '';
        }
      }

      await this.mqttService.publish(topic, JSON.stringify(payload), { qos: 1 });
      return true;
    } catch (error) {
      this.logger.error(
        `Failed to set value bulk for device ${device.token}: ${error.message}`,
      );
      return false;
    }
  }
}
