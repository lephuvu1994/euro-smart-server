import {
  Controller,
  Post,
  Body,
  Param,
  Req,
  UseGuards,
  Get,
  Query,
  HttpStatus,
} from '@nestjs/common';
import { RegisterDeviceDto } from '../dto/register-device.dto';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { JwtAccessGuard } from '@app/common/request/guards/jwt.access.guard';
import { RolesGuard } from '@app/common/request/guards/roles.guard';
import { DeviceProvisioningService } from '../services/device-provisioning.service';
import { DeviceControlService } from '../services/device-control.service';
import { SetFeatureValueDto } from '../dto/set-feature-value.dto';
import { DeviceService } from '../services/device.service';
import { GetDevicesDto } from '../dto/get-devices.dto';

@ApiTags('Devices')
@UseGuards(JwtAccessGuard, RolesGuard)
@ApiBearerAuth('accessToken')
@Controller('/devices')
export class DeviceController {
  constructor(
    private readonly provisioningService: DeviceProvisioningService,
    private readonly deviceControlService: DeviceControlService,
    private readonly deviceService: DeviceService,
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
  async getDeviceConfig() {
    const data = await this.deviceService.getDeviceUiConfigs();
    return {
      statusCode: HttpStatus.OK,
      data,
    };
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
  async refreshDeviceConfig() {
    const result = await this.deviceService.refreshDeviceUiConfigCache();
    return {
      statusCode: HttpStatus.OK,
      ...result,
    };
  }

  @Post('register')
  @ApiOperation({
    summary:
      'Đăng ký và chiếm quyền sở hữu thiết bị (Claim) — dùng cho cả BLE và AP mode',
  })
  async registerDevice(@Req() req: any, @Body() dto: RegisterDeviceDto) {
    return await this.provisioningService.registerAndClaim(
      req.user.userId,
      dto,
    );
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
  async setEntityValue(
    @Param('deviceToken') deviceToken: string,
    @Param('entityCode') entityCode: string,
    @Body() body: SetFeatureValueDto,
    @Req() req: any,
  ) {
    const userId = req.user.userId;
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
  async setDeviceValue(
    @Param('deviceToken') deviceToken: string,
    @Body() body: SetFeatureValueDto,
    @Req() req: any,
  ) {
    const userId = req.user.userId;
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
  async getSiriSync(@Req() req: any) {
    const userId = req.user.userId || req.user.id;
    const result = await this.deviceService.getSiriSyncData(userId);

    return {
      statusCode: HttpStatus.OK,
      data: result,
    };
  }

  /**
   * API: Lấy danh sách thiết bị của User (có phân trang)
   * GET /v1/devices?page=1&limit=10
   */
  @Get()
  async getMyDevices(@Req() req: any, @Query() query: GetDevicesDto) {
    const userId = req.user.userId;
    const result = await this.deviceService.getUserDevices(userId, query);

    return {
      statusCode: HttpStatus.OK,
      message: 'Lấy danh sách thiết bị thành công',
      data: result.data,
      meta: result.meta,
    };
  }
  /**
   * API: Lấy chi tiết một thiết bị
   * GET /v1/devices/:id
   */
  @Get(':id')
  async getDeviceDetail(@Param('id') id: string, @Req() req: any) {
    const userId = req.user.userId;
    const device = await this.deviceService.getDeviceDetail(id, userId);

    return {
      statusCode: HttpStatus.OK,
      message: 'Lấy thông tin thiết bị thành công',
      data: { device },
    };
  }
}
