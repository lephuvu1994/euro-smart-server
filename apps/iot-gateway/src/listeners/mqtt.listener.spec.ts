import { Test, TestingModule } from '@nestjs/testing';
import { MqttListener } from './mqtt.listener';
import { MqttService } from '@app/common/mqtt/mqtt.service';
import { DeviceStatusService } from '../services/device-status.service';
import { DeviceStateService } from '../services/device-state.service';

const mockMqttService = {
  subscribe: jest.fn(),
};

const mockStatusService = {
  processStatus: jest.fn(),
};

const mockStateService = {
  processState: jest.fn(),
};

describe('MqttListener', () => {
  let listener: MqttListener;
  let statusService: typeof mockStatusService;
  let stateService: typeof mockStateService;
  let mqttService: typeof mockMqttService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        MqttListener,
        { provide: MqttService, useValue: mockMqttService },
        { provide: DeviceStatusService, useValue: mockStatusService },
        { provide: DeviceStateService, useValue: mockStateService },
      ],
    }).compile();

    listener = module.get<MqttListener>(MqttListener);
    statusService = module.get(DeviceStatusService);
    stateService = module.get(DeviceStateService);
    mqttService = module.get(MqttService);

    jest.clearAllMocks();
  });

  it('should subscribe on bootstrap', () => {
    listener.onApplicationBootstrap();
    expect(mqttService.subscribe).toHaveBeenCalledTimes(3);
  });

  describe('handleStatusMessage', () => {
    it('should extract token and call status service', async () => {
      const topic = 'device/token-1/status';
      const payload = Buffer.from(JSON.stringify({ online: true }));

      await (listener as any).handleStatusMessage(topic, payload);

      expect(statusService.processStatus).toHaveBeenCalledWith('token-1', {
        online: true,
      });
    });

    it('should log error if JSON is invalid in status message', async () => {
      const topic = 'device/token-1/status';
      const payload = Buffer.from('invalid-json');
      const loggerSpy = jest.spyOn((listener as any).logger, 'error');

      await (listener as any).handleStatusMessage(topic, payload);

      expect(loggerSpy).toHaveBeenCalledWith(
        expect.stringContaining('Failed to parse status message'),
      );
    });

    it('should skip if token cannot be extracted in status message', async () => {
      const topic = 'invalid-topic';
      const payload = Buffer.from('{}');

      await (listener as any).handleStatusMessage(topic, payload);

      expect(statusService.processStatus).not.toHaveBeenCalled();
    });
  });

  describe('handleStateMessage', () => {
    it('should extract token and call state service', async () => {
      const topic = 'device/token-1/state';
      const payload = Buffer.from(JSON.stringify({ state: 'OPEN' }));

      await listener.handleStateMessage(topic, payload);

      expect(stateService.processState).toHaveBeenCalledWith('token-1', {
        state: 'OPEN',
      });
    });

    it('should skip if token cannot be extracted in state message', async () => {
      const topic = 'invalid-topic';
      const payload = Buffer.from('{}');
      const loggerSpy = jest.spyOn((listener as any).logger, 'error');

      await listener.handleStateMessage(topic, payload);

      expect(stateService.processState).not.toHaveBeenCalled();
      expect(loggerSpy).toHaveBeenCalledWith(
        expect.stringContaining('Invalid topic format'),
      );
    });

    it('should log error if JSON is invalid in state message', async () => {
      const topic = 'device/token-1/state';
      const payload = Buffer.from('invalid-json');
      const loggerSpy = jest.spyOn((listener as any).logger, 'error');

      await listener.handleStateMessage(topic, payload);

      expect(loggerSpy).toHaveBeenCalledWith(
        expect.stringContaining('Invalid JSON'),
      );
    });
  });

  describe('extractToken', () => {
    it('should return null for null topic', () => {
      expect((listener as any).extractToken(null)).toBeNull();
    });

    it('should return null for non-string topic', () => {
      expect((listener as any).extractToken(123)).toBeNull();
    });
  });
});
