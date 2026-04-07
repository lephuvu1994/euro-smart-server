import { Test, TestingModule } from '@nestjs/testing';
import { Zigbee2MqttListener } from './zigbee2mqtt.listener';
import { MqttService } from '@app/common/mqtt/mqtt.service';
import { DeviceStatusService } from '../services/device-status.service';
import { DeviceStateService } from '../services/device-state.service';

jest.mock('expo-server-sdk', () => ({ __esModule: true, default: jest.fn(), Expo: jest.fn() }));
jest.mock('@faker-js/faker', () => ({
  faker: {
    string: { alphanumeric: () => 'abc', uuid: () => 'uuid' },
    internet: { email: () => 'test@test.com' },
    person: { firstName: () => 'First', lastName: () => 'Last' },
    number: { int: () => 1 },
    phone: { number: () => '123' },
    date: { past: () => new Date(), future: () => new Date() },
    datatype: { boolean: () => true },
  },
}));

const mockMqttService = {
  subscribe: jest.fn(),
};

const mockStatusService = {
  processStatus: jest.fn(),
};

const mockStateService = {
  processState: jest.fn(),
};

describe('Zigbee2MqttListener', () => {
  let listener: Zigbee2MqttListener;
  let statusService: typeof mockStatusService;
  let stateService: typeof mockStateService;
  let mqttService: typeof mockMqttService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        Zigbee2MqttListener,
        { provide: MqttService, useValue: mockMqttService },
        { provide: DeviceStatusService, useValue: mockStatusService },
        { provide: DeviceStateService, useValue: mockStateService },
      ],
    }).compile();

    listener = module.get<Zigbee2MqttListener>(Zigbee2MqttListener);
    statusService = module.get(DeviceStatusService);
    stateService = module.get(DeviceStateService);
    mqttService = module.get(MqttService);

    jest.clearAllMocks();
  });

  it('should subscribe on bootstrap', () => {
    listener.onApplicationBootstrap();
    expect(mqttService.subscribe).toHaveBeenCalledTimes(2);
  });

  describe('handleAvailabilityMessage', () => {
    it('should extract token and call status service (online)', async () => {
      const topic = 'zigbee2mqtt/device-1/availability';
      const payload = Buffer.from(JSON.stringify({ state: 'online' }));

      await listener['handleAvailabilityMessage'](topic, payload);

      expect(statusService.processStatus).toHaveBeenCalledWith('device-1', {
        online: true,
        state: 'online',
      });
    });

    it('should skip bridge or NaN tokens', async () => {
      await listener['handleAvailabilityMessage'](
        'zigbee2mqtt/bridge/availability',
        Buffer.from('{"state":"online"}'),
      );
      expect(statusService.processStatus).not.toHaveBeenCalled();

      await listener['handleAvailabilityMessage'](
        'zigbee2mqtt//availability',
        Buffer.from('{"state":"online"}'),
      );
      expect(statusService.processStatus).not.toHaveBeenCalled();
    });

    it('should log error if JSON is invalid in availability', async () => {
      const topic = 'zigbee2mqtt/device-1/availability';
      const payload = Buffer.from('invalid-json');
      const loggerSpy = jest.spyOn(listener['logger'], 'error');

      await listener['handleAvailabilityMessage'](topic, payload);

      expect(loggerSpy).toHaveBeenCalledWith(
        expect.stringContaining('Failed to parse Z2M availability'),
      );
    });
  });

  describe('handleDeviceMessage', () => {
    it('should extract token and call state service', async () => {
      const topic = 'zigbee2mqtt/device-1';
      const payload = Buffer.from(JSON.stringify({ state: 'ON' }));

      await listener['handleDeviceMessage'](topic, payload);

      expect(stateService.processState).toHaveBeenCalledWith('device-1', {
        state: 'ON',
      });
    });

    it('should skip bridge messages', async () => {
      await listener['handleDeviceMessage'](
        'zigbee2mqtt/bridge/info',
        Buffer.from('{}'),
      );
      expect(stateService.processState).not.toHaveBeenCalled();
    });

    it('should skip if token is missing', async () => {
      await listener['handleDeviceMessage'](
        'zigbee2mqtt/',
        Buffer.from('{}'),
      );
      expect(stateService.processState).not.toHaveBeenCalled();
    });

    it('should log error if JSON is invalid', async () => {
      const topic = 'zigbee2mqtt/device-1';
      const payload = Buffer.from('invalid-json');
      const loggerSpy = jest.spyOn(listener['logger'], 'error');

      await listener['handleDeviceMessage'](topic, payload);

      expect(loggerSpy).toHaveBeenCalledWith(
        expect.stringContaining('Invalid JSON'),
      );
    });
  });
});
