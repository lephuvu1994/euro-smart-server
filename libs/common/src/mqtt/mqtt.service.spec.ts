import { Test, TestingModule } from '@nestjs/testing';
import { MqttService } from './mqtt.service';
import { ConfigService } from '@nestjs/config';
import mqtt from 'mqtt';

jest.mock('mqtt');

describe('MqttService', () => {
  let service: MqttService;
  let mockMqttClient: any;

  beforeEach(async () => {
    mockMqttClient = {
      on: jest.fn(),
      publish: jest.fn(),
      subscribe: jest.fn(),
      end: jest.fn(),
      reconnect: jest.fn(),
      connected: true,
    };

    (mqtt.connect as jest.Mock).mockReturnValue(mockMqttClient);

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        MqttService,
        {
          provide: ConfigService,
          useValue: {
            get: jest.fn((key: string) => {
              const config: Record<string, any> = {
                MQTT_HOST: 'mqtt://localhost',
                MQTT_PORT: 1883,
                MQTT_USER: 'testuser',
                MQTT_PASS: 'testpass',
              };
              return config[key];
            }),
          },
        },
      ],
    }).compile();

    service = module.get<MqttService>(MqttService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('Initialization', () => {
    it('should be defined', () => {
      expect(service).toBeDefined();
    });

    it('should connect to MQTT broker on module init', () => {
      service.onModuleInit();
      expect((mqtt.connect as jest.Mock)).toHaveBeenCalledWith('mqtt://localhost', expect.objectContaining({
        port: 1883,
        username: 'testuser',
        password: 'testpass',
      }));
      expect(mockMqttClient.on).toHaveBeenCalledWith('connect', expect.any(Function));
      expect(mockMqttClient.on).toHaveBeenCalledWith('error', expect.any(Function));
      expect(mockMqttClient.on).toHaveBeenCalledWith('message', expect.any(Function));
    });
  });

  describe('Publishing', () => {
    beforeEach(() => {
      service.onModuleInit();
    });

    it('should publish a string message', async () => {
      mockMqttClient.publish.mockImplementation((topic: string, msg: any, opts: any, cb: any) => cb(null));
      await service.publish('test/topic', 'hello');
      expect(mockMqttClient.publish).toHaveBeenCalledWith('test/topic', 'hello', expect.any(Object), expect.any(Function));
    });

    it('should publish an object message as JSON string', async () => {
      mockMqttClient.publish.mockImplementation((topic: string, msg: any, opts: any, cb: any) => cb(null));
      const obj = { key: 'value' };
      await service.publish('test/topic', obj);
      expect(mockMqttClient.publish).toHaveBeenCalledWith('test/topic', JSON.stringify(obj), expect.any(Object), expect.any(Function));
    });

    it('should reject if not connected', async () => {
      mockMqttClient.connected = false;
      await expect(service.publish('test/topic', 'hello')).rejects.toThrow('MQTT not connected');
    });

    it('should reject if publish callback returns error', async () => {
      const error = new Error('Publish error');
      mockMqttClient.publish.mockImplementation((topic: string, msg: any, opts: any, cb: any) => cb(error));
      await expect(service.publish('test/topic', 'hello')).rejects.toThrow('Publish error');
    });
  });

  describe('Subscribing', () => {
    beforeEach(() => {
      service.onModuleInit();
    });

    it('should execute subscribe command immediately if connected', () => {
      mockMqttClient.subscribe.mockImplementation((topic: string, opts: any, cb: any) => cb(null));
      const callback = jest.fn();
      
      service.subscribe('test/topic', callback);
      
      expect(mockMqttClient.subscribe).toHaveBeenCalledWith('test/topic', expect.any(Object), expect.any(Function));
    });

    it('should queue subscription if offline, then subscribe on connect event', () => {
      mockMqttClient.connected = false;
      const callback = jest.fn();
      
      service.subscribe('test/topic', callback);
      
      // Should not call subscribe on mqtt client yet
      expect(mockMqttClient.subscribe).not.toHaveBeenCalled();

      // Trigger the 'connect' event manually
      const connectHandler = mockMqttClient.on.mock.calls.find((call: any[]) => call[0] === 'connect')[1];
      connectHandler();

      // Now it should have been called during the replay loop inside 'connect'
      expect(mockMqttClient.subscribe).toHaveBeenCalledWith('test/topic', expect.any(Object), expect.any(Function));
    });
  });

  describe('Unsubscribing', () => {
    beforeEach(() => {
      service.onModuleInit();
      mockMqttClient.unsubscribe = jest.fn().mockImplementation((topic: string, opts: any, cb: any) => cb(null));
    });

    it('should remove the exact callback from subscriptions', () => {
      const callback1 = jest.fn();
      const callback2 = jest.fn();
      
      service.subscribe('test/topic', callback1);
      service.subscribe('test/topic', callback2);
      
      service.unsubscribe('test/topic', callback1);
      
      // Should not call actual unsubscribe because callback2 is still listening
      expect(mockMqttClient.unsubscribe).not.toHaveBeenCalled();
    });

    it('should call client.unsubscribe if no callbacks remain for the topic', () => {
      const callback = jest.fn();
      service.subscribe('test/topic', callback);
      
      service.unsubscribe('test/topic', callback);
      
      expect(mockMqttClient.unsubscribe).toHaveBeenCalledWith('test/topic', expect.any(Object), expect.any(Function));
    });

    it('should unsubscribe all callbacks for a topic if callback is not provided', () => {
      const callback1 = jest.fn();
      const callback2 = jest.fn();
      
      service.subscribe('test/topic', callback1);
      service.subscribe('test/topic', callback2);
      
      service.unsubscribe('test/topic');
      
      expect(mockMqttClient.unsubscribe).toHaveBeenCalledWith('test/topic', expect.any(Object), expect.any(Function));
    });
  });

  describe('Message Routing logic via matches()', () => {
    beforeEach(() => {
      service.onModuleInit();
    });

    it('should route messages to matching callback (exact match)', () => {
      const callback = jest.fn();
      service.subscribe('device/123/status', callback);

      const messageHandler = mockMqttClient.on.mock.calls.find((call: any[]) => call[0] === 'message')[1];
      const payload = Buffer.from('test data');

      messageHandler('device/123/status', payload);
      expect(callback).toHaveBeenCalledWith('device/123/status', payload);
    });

    it('should route messages to matching callback (+ wildcard)', () => {
      const callback = jest.fn();
      service.subscribe('device/+/status', callback);

      const messageHandler = mockMqttClient.on.mock.calls.find((call: any[]) => call[0] === 'message')[1];
      const payload = Buffer.from('test data');

      messageHandler('device/abc/status', payload);
      expect(callback).toHaveBeenCalledWith('device/abc/status', payload);
    });

    it('should route messages to matching callback (# wildcard)', () => {
      const callback = jest.fn();
      service.subscribe('device/#', callback);

      const messageHandler = mockMqttClient.on.mock.calls.find((call: any[]) => call[0] === 'message')[1];
      const payload = Buffer.from('test data');

      messageHandler('device/abc/status/battery', payload);
      expect(callback).toHaveBeenCalledWith('device/abc/status/battery', payload);
    });

    it('should NOT route messages to non-matching callback', () => {
      const callback = jest.fn();
      service.subscribe('device/+/status', callback);

      const messageHandler = mockMqttClient.on.mock.calls.find((call: any[]) => call[0] === 'message')[1];
      
      messageHandler('device/123/config', Buffer.from('test'));
      expect(callback).not.toHaveBeenCalled();
    });
  });

  describe('Cleanup lifecycle', () => {
    it('should correctly destroy client on module destroy', () => {
      service.onModuleInit();
      service.onModuleDestroy();
      expect(mockMqttClient.end).toHaveBeenCalled();
    });
  });
});
