
import {
  Controller,
  Post,
  Body,
  Param,
  UseGuards,
  Get,
  Query,
  HttpStatus,
} from '@nestjs/common';
import { DocResponse } from '@app/common';
import { AuthUser } from '@app/common/request/decorators/request.user.decorator';
import { IAuthUser } from '@app/common/request/interfaces/request.interface';
import { RegisterDeviceDto } from '../dto/register-device.dto';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { JwtAccessGuard } from '@app/common/request/guards/jwt.access.guard';
import { RolesGuard } from '@app/common/request/guards/roles.guard';
import { DeviceProvisioningService } from '../services/device-provisioning.service';
import { DeviceControlService } from '../services/device-control.service';
import { SetEntityValueDto } from '../dto/set-entity-value.dto';
import { DeviceService } from '../services/device.service';
import { GetDevicesDto } from '../dto/get-devices.dto';
import { EmqxAuthService } from '../../emqx-auth/services/emqx-auth.service';

@ApiTags('Devices')
@UseGuards(JwtAccessGuard, RolesGuard)
@ApiBearerAuth('accessToken')
@Controller('/devices')
export class DeviceController {
  constructor(
    private readonly provisioningService: DeviceProvisioningService,
    private readonly deviceControlService: DeviceControlService,
    private readonly deviceService: DeviceService,
    private readonly emqxAuthService: EmqxAuthService,
  ) {}

  /**
   * API: Device UI Config — trả về JSON config cho app render theo loại thiết bị.
   * GET /v1/devices/config
   * Flow: Redis cache → DB → seed defaults.
   * MUST be before :id route to avoid route conflict.
   */
  @Get('config')
  @ApiOperation({
    summary: 'Get device UI config for app rendering',
    description:
      'Returns JSON config mapping device types to UI properties. Cached in Redis, stored in DB (SystemConfig).',
  })
  @DocResponse({ messageKey: 'device.config.success', httpStatus: HttpStatus.OK })
  async getDeviceConfig() {
    return await this.deviceService.getDeviceUiConfigs();
  }

  /**
   * API: Get MQTT credentials for app to connect EMQX directly.
   * GET /v1/devices/mqtt-credentials
   * Returns HMAC-signed credentials (0 DB query).
   * MUST be before :id route to avoid route conflict.
   */
  @Get('mqtt-credentials')
  @ApiOperation({
    summary: 'Get MQTT credentials for real-time device updates',
    description:
      'Returns WSS URL, username, HMAC password, and clientId for direct EMQX connection.',
  })
  @DocResponse({ messageKey: 'device.mqtt.success', httpStatus: HttpStatus.OK })
  getMqttCredentials(@AuthUser() user: IAuthUser) {
    const userId = user.userId;
    return this.emqxAuthService.generateCredentials(userId);
  }

  /**
   * API: Refresh Redis cache for device UI config.
   * POST /v1/devices/config/refresh
   * Called after admin updates config in DB (via dashboard, SQL, etc.)
   */
  @Post('config/refresh')
  @ApiOperation({
    summary: 'Refresh device UI config Redis cache from DB',
    description:
      'Re-reads SystemConfig from DB and updates Redis cache. Use after config changes.',
  })
  @DocResponse({ messageKey: 'device.config.refreshSuccess', httpStatus: HttpStatus.OK })
  async refreshDeviceConfig() {
    return await this.deviceService.refreshDeviceUiConfigCache();
  }

  @Post('register')
  @ApiOperation({
    summary:
      'Đăng ký và chiếm quyền sở hữu thiết bị (Claim) — dùng cho cả BLE và AP mode',
  })
  @DocResponse({ messageKey: 'device.register.success', httpStatus: HttpStatus.OK })
  async registerDevice(
    @AuthUser() user: IAuthUser,
    @Body() dto: RegisterDeviceDto,
  ) {
    return await this.provisioningService.registerAndClaim(user.userId, dto);
  }

  /**
   * API: Điều khiển 1 entity của thiết bị
   * POST /v1/devices/:deviceToken/entities/:entityCode/setValue
   */
  @Post(':deviceToken/entities/:entityCode/setValue')
  @ApiOperation({
    summary:
      'Điều khiển entity thiết bị (Bật/Tắt, Điều chỉnh độ sáng, đóng mở cửa...)',
    description: 'Điều khiển 1 entity của thiết bị theo entity code',
  })
  @DocResponse({ messageKey: 'device.control.success', httpStatus: HttpStatus.OK })
  async setEntityValue(
    @Param('deviceToken') deviceToken: string,
    @Param('entityCode') entityCode: string,
    @Body() body: SetEntityValueDto,
    @AuthUser() user: IAuthUser,
  ) {
    const userId = user.userId;
    return await this.deviceControlService.sendControlCommand(
      deviceToken,
      userId,
      entityCode,
      body.value,
    );
  }

  /**
   * API: Điều khiển bulk nhiều entities của 1 thiết bị
   * POST /v1/devices/:deviceToken/setValue
   * Body: { value: [{ entityCode, value }] }
   */
  @Post(':deviceToken/setValue')
  @ApiOperation({
    summary: 'Điều khiển bulk nhiều entities của thiết bị',
    description:
      'Gửi lệnh cho nhiều entities cùng lúc (VD: bật + chỉnh độ sáng)',
  })
  @DocResponse({ messageKey: 'device.control.success', httpStatus: HttpStatus.OK })
  async setDeviceValue(
    @Param('deviceToken') deviceToken: string,
    @Body() body: SetEntityValueDto,
    @AuthUser() user: IAuthUser,
  ) {
    const userId = user.userId;
    return await this.deviceControlService.sendDeviceValueCommand(
      deviceToken,
      userId,
      body.value,
    );
  }

  /**
   * API: Siri Sync — get all devices + scenes for Siri entity registration
   * GET /v1/devices/siri-sync
   * MUST be before :id route to avoid route conflict
   */
  @Get('siri-sync')
  @ApiOperation({
    summary: 'Get all devices + scenes for Siri/Google Assistant sync',
  })
  @DocResponse({ messageKey: 'device.siriSync.success', httpStatus: HttpStatus.OK })
  async getSiriSync(@AuthUser() user: IAuthUser) {
    const userId = user.userId;
    return await this.deviceService.getSiriSyncData(userId);
  }

  /**
   * API: Lấy danh sách thiết bị của User (có phân trang)
   * GET /v1/devices?page=1&limit=10
   */
  @Get()
  @ApiOperation({ summary: 'Lấy danh sách thiết bị của User (có phân trang)' })
  @DocResponse({ messageKey: 'device.list.success', httpStatus: HttpStatus.OK })
  async getMyDevices(
    @AuthUser() user: IAuthUser,
    @Query() query: GetDevicesDto,
  ) {
    const userId = user.userId;
    return await this.deviceService.getUserDevices(userId, query);
  }
  /**
   * API: Lấy chi tiết một thiết bị
   * GET /v1/devices/:id
   */
  @Get(':id')
  @ApiOperation({ summary: 'Lấy chi tiết một thiết bị' })
  @DocResponse({ messageKey: 'device.detail.success', httpStatus: HttpStatus.OK })
  async getDeviceDetail(
    @Param('id') id: string,
    @AuthUser() user: IAuthUser,
  ) {
    const userId = user.userId;
    return await this.deviceService.getDeviceDetail(id, userId);
  }
}
