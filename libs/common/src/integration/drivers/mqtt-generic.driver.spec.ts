import { Logger } from '@nestjs/common';
import { MqttGenericDriver } from './mqtt-generic.driver';
import { MqttService } from '../../mqtt/mqtt.service';
import { DeviceEntity } from '@prisma/client';

describe('MqttGenericDriver', () => {
  let driver: MqttGenericDriver;
  let mqttService: jest.Mocked<MqttService>;

  beforeEach(() => {
    mqttService = {
      publish: jest.fn().mockResolvedValue(undefined),
    } as any;
    driver = new MqttGenericDriver(mqttService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('setValue', () => {
    it('should format payload with commandKey and publish to device/token/suffix', async () => {
      const device = { token: 'token-123' };
      const entity = { commandSuffix: '/custom', commandKey: 'brightness' };
      const value = 50;

      const result = await driver.setValue(device, entity, value);

      expect(mqttService.publish).toHaveBeenCalledWith(
        'device/token-123/custom',
        '{"brightness":50}',
        { qos: 1 },
      );
      expect(result).toBe(true);
    });

    it('should use default suffix "set" and raw payload if no commandKey is provided', async () => {
      const device = { token: 'token-456' };
      const entity = {};
      const value = 'raw_value';

      const result = await driver.setValue(device, entity, value);

      expect(mqttService.publish).toHaveBeenCalledWith(
        'device/token-456/set',
        '"raw_value"',
        { qos: 1 },
      );
      expect(result).toBe(true);
    });

    it('should return false and log error if publish fails', async () => {
      mqttService.publish.mockRejectedValueOnce(new Error('Mqtt Error'));
      const loggerSpy = jest
        .spyOn(Logger.prototype, 'error')
        .mockImplementation(jest.fn());

      const result = await driver.setValue({ token: '1' }, { code: 'c' }, 1);

      expect(result).toBe(false);
      expect(loggerSpy).toHaveBeenCalledWith(
        'Failed to set value for device 1, entity c: Mqtt Error',
      );
    });
  });

  describe('setValueBulk', () => {
    it('should return true immediately if entities array is empty', async () => {
      const result = await driver.setValueBulk({ token: '123' }, []);
      expect(result).toBe(true);
      expect(mqttService.publish).not.toHaveBeenCalled();
    });

    it('should group entities by commandSuffix and publish separately', async () => {
      const device = { token: 'bulk-token' };
      const entities = [
        { commandSuffix: '/bulk', commandKey: 'switch1', state: true },
        { commandKey: 'switch2', stateText: 'off' },
      ] as any;

      const result = await driver.setValueBulk(device, entities);

      // Different commandSuffix → 2 separate publishes
      expect(mqttService.publish).toHaveBeenCalledTimes(2);
      expect(mqttService.publish).toHaveBeenCalledWith(
        'device/bulk-token/bulk',
        '{"switch1":true}',
        { qos: 1 },
      );
      expect(mqttService.publish).toHaveBeenCalledWith(
        'device/bulk-token/set',
        '{"switch2":"off"}',
        { qos: 1 },
      );
      expect(result).toBe(true);
    });

    it('should ignore entities without commandKey', async () => {
      const device = { token: 'bulk-token' };
      const entities = [
        { commandKey: 'switch1', state: true },
        { state: true }, // ignored
      ] as any;

      const result = await driver.setValueBulk(device, entities);

      expect(mqttService.publish).toHaveBeenCalledWith(
        'device/bulk-token/set',
        '{"switch1":true}',
        { qos: 1 },
      );
      expect(result).toBe(true);
    });

    it('should return false and log error if bulk publish fails', async () => {
      mqttService.publish.mockRejectedValueOnce(new Error('Bulk Error'));
      const loggerSpy = jest
        .spyOn(Logger.prototype, 'error')
        .mockImplementation(jest.fn());

      const result = await driver.setValueBulk({ token: 't' }, [
        { commandKey: 'k', state: 1 } as any,
      ]);

      expect(result).toBe(false);
      expect(loggerSpy).toHaveBeenCalledWith(
        'Failed to set value bulk for device t: Bulk Error',
      );
    });
  });

  describe('publishRaw', () => {
    it('should publish raw payload to the device set topic', async () => {
      const result = await driver.publishRaw(
        { token: 'raw-token' },
        { raw: 'data' },
      );

      expect(mqttService.publish).toHaveBeenCalledWith(
        'device/raw-token/set',
        '{"raw":"data"}',
        { qos: 1 },
      );
      expect(result).toBe(true);
    });

    it('should return false and log error if raw publish fails', async () => {
      mqttService.publish.mockRejectedValueOnce(new Error('Raw Error'));
      const loggerSpy = jest
        .spyOn(Logger.prototype, 'error')
        .mockImplementation(jest.fn());

      const result = await driver.publishRaw({ token: 't' }, {});

      expect(result).toBe(false);
      expect(loggerSpy).toHaveBeenCalledWith(
        'Failed publishRaw to t: Raw Error',
      );
    });
  });
});
