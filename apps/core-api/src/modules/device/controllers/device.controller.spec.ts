import { Test, TestingModule } from '@nestjs/testing';

jest.mock('expo-server-sdk', () => ({ __esModule: true, default: jest.fn(), Expo: jest.fn() }));

import { DeviceController } from './device.controller';
import { DeviceService } from '../services/device.service';
import { UserRole } from '@prisma/client';
import { IAuthUser } from '@app/common/request/interfaces/request.interface';

import { DeviceProvisioningService } from '../services/device-provisioning.service';
import { DeviceControlService } from '../services/device-control.service';
import { EmqxAuthService } from '../../emqx-auth/services/emqx-auth.service';

describe('DeviceController', () => {
  let controller: DeviceController;
  let service: DeviceService;

  const mockDeviceService = {
    getUserDevices: jest.fn(),
    getDeviceTimeline: jest.fn(),
    getDeviceDetail: jest.fn(),
    updateDeviceName: jest.fn(),
    updateNotifyConfig: jest.fn(),
  };

  const mockProvisioningService = {};
  const mockDeviceControlService = {};
  const mockEmqxAuthService = {};

  const mockUser: IAuthUser = {
    userId: 'user-1',
    role: UserRole.USER,
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [DeviceController],
      providers: [
        {
          provide: DeviceService,
          useValue: mockDeviceService,
        },
        {
          provide: DeviceProvisioningService,
          useValue: mockProvisioningService,
        },
        {
          provide: DeviceControlService,
          useValue: mockDeviceControlService,
        },
        {
          provide: EmqxAuthService,
          useValue: mockEmqxAuthService,
        },
      ],
    }).compile();

    controller = module.get<DeviceController>(DeviceController);
    service = module.get<DeviceService>(DeviceService);
    jest.clearAllMocks();
  });

  describe('getDeviceTimeline', () => {
    it('should call deviceService.getDeviceTimeline with correct parameters', async () => {
      const deviceId = 'a15cb911-f4f8-40a2-ad9e-45e63ad093f5';
      const query = { page: 1, limit: 5 };
      mockDeviceService.getDeviceTimeline.mockResolvedValue({
        data: [{ id: '1', event: 'online' }],
        meta: { total: 1, page: 1, lastPage: 1 },
      });

      const result = await controller.getDeviceTimeline(deviceId, query, mockUser);

      expect(service.getDeviceTimeline).toHaveBeenCalledWith(deviceId, mockUser.userId, query);
      expect(result.data).toHaveLength(1);
    });
  });

  describe('getDeviceDetail', () => {
    it('should call deviceService.getDeviceDetail with correct parameters', async () => {
      const deviceId = 'a15cb911-f4f8-40a2-ad9e-45e63ad093f5';
      mockDeviceService.getDeviceDetail.mockResolvedValue({ id: deviceId, name: 'Mock Device' });

      const result = await controller.getDeviceDetail(deviceId, mockUser);

      expect(service.getDeviceDetail).toHaveBeenCalledWith(deviceId, mockUser.userId);
      expect(result.id).toBe(deviceId);
    });
  });

  describe('updateDeviceName', () => {
    it('should call deviceService.updateDeviceName with correct parameters', async () => {
      const deviceId = 'a15cb911-f4f8-40a2-ad9e-45e63ad093f5';
      const dto = { name: 'New Device Name' };
      mockDeviceService.updateDeviceName.mockResolvedValue({ id: deviceId, name: 'New Device Name' });

      const result = await controller.updateDeviceName(deviceId, dto, mockUser);

      expect(service.updateDeviceName).toHaveBeenCalledWith(deviceId, mockUser.userId, dto.name);
      expect(result.name).toBe('New Device Name');
    });
  });

  describe('getMyDevices', () => {
    it('should call deviceService.getUserDevices with correct parameters', async () => {
      const query = { page: 1, limit: 10 };
      mockDeviceService.getUserDevices.mockResolvedValue({
        data: [{ id: '1' }],
        meta: { total: 1, page: 1, lastPage: 1 },
      });

      const result = await controller.getMyDevices(mockUser, query);

      expect(service.getUserDevices).toHaveBeenCalledWith(mockUser.userId, query);
      expect(result.data).toHaveLength(1);
    });
  });

  describe('updateNotifyConfig', () => {
    it('should call deviceService.updateNotifyConfig with correct parameters', async () => {
      const deviceId = 'a15cb911-f4f8-40a2-ad9e-45e63ad093f5';
      const dto = { notify: { offline: true } };
      mockDeviceService.updateNotifyConfig.mockResolvedValue({ id: deviceId, customConfig: { notify: { offline: true } } });

      const result = await controller.updateNotifyConfig(deviceId, dto, mockUser);

      expect(service.updateNotifyConfig).toHaveBeenCalledWith(deviceId, mockUser.userId, dto.notify);
      expect((result as any).customConfig.notify.offline).toBe(true);
    });
  });
});
