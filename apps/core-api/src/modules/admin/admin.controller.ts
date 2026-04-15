import {
  Body,
  Controller,
  Get,
  Delete,
  Param,
  Post,
  Put,
  Query,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOperation,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { UserRole } from '@prisma/client';

import { JwtAccessGuard } from '@app/common/request/guards/jwt.access.guard';
import { RolesGuard } from '@app/common/request/guards/roles.guard';
import { AllowedRoles } from '@app/common/request/decorators/request.role.decorator';

import { AdminService } from './admin.service';
import { CreatePartnerDto } from './dtos/request/create-partner.dto';
import { UpdatePartnerDto } from './dtos/request/update-partner.dto';
import { CreateDeviceModelDto } from './dtos/request/create-device-model.dto';
import { SetMqttConfigDto } from './dtos/request/set-mqtt-config.dto';
import { UpdateSystemConfigDto } from './dtos/request/update-system-config.dto';
import { UpdateDeviceUiConfigDto } from './dtos/request/update-device-ui-config.dto';
import { PartnerUsageResponseDto } from './dtos/response/partner-usage.response.dto';
import { SystemConfigResponseDto } from './dtos/response/system-config.response.dto';
import { DashboardStatsResponseDto } from './dtos/response/dashboard-stats.response.dto';

@ApiTags('admin.metadata')
@Controller({ version: '1', path: '/admin' })
@UseGuards(JwtAccessGuard, RolesGuard)
@ApiBearerAuth('accessToken')
@AllowedRoles([UserRole.ADMIN])
export class AdminController {
  constructor(private readonly adminService: AdminService) {}

  // ──────────────────────────────────────────────
  // DASHBOARD
  // ──────────────────────────────────────────────

  @Get('dashboard/stats')
  @ApiOperation({ summary: 'Get Dashboard Statistics' })
  @ApiResponse({ status: 200, type: DashboardStatsResponseDto })
  getDashboardStats(): Promise<DashboardStatsResponseDto> {
    return this.adminService.getDashboardStats();
  }

  // ──────────────────────────────────────────────
  // PARTNERS
  // ──────────────────────────────────────────────

  @Post('partners')
  @ApiOperation({ summary: 'Create new Partner/Company' })
  createPartner(@Body() body: CreatePartnerDto) {
    return this.adminService.createPartner(body);
  }

  @Get('options/partners')
  @ApiOperation({
    summary: 'Get Partners for Dropdown',
    description: 'Lấy danh sách code & name để hiện vào Select.',
  })
  getPartnerOptions() {
    return this.adminService.getPartnersForDropdown();
  }

  @Get('stats/partners')
  @ApiOperation({ summary: 'Get Partners usage statistics' })
  @ApiResponse({ status: 200, type: [PartnerUsageResponseDto] })
  getPartnersUsage(): Promise<PartnerUsageResponseDto[]> {
    return this.adminService.getPartnersUsage();
  }

  @Put('partners/:code')
  @ApiOperation({
    summary: 'Update Partner info & quotas',
    description: 'API đa năng: sửa tên, quota, hoặc cả hai.',
  })
  updatePartner(@Param('code') code: string, @Body() body: UpdatePartnerDto) {
    return this.adminService.updatePartner(code, body);
  }

  // ──────────────────────────────────────────────
  // HARDWARE REGISTRY
  // ──────────────────────────────────────────────

  @Get('hardwares')
  @ApiOperation({
    summary: 'Get physical devices (Hardware Registry) with pagination',
  })
  getHardwares(@Query('page') page?: string, @Query('limit') limit?: string) {
    return this.adminService.getHardwares(
      Math.max(1, parseInt(page || '1', 10)),
      Math.min(100, Math.max(1, parseInt(limit || '50', 10))),
    );
  }

  // ──────────────────────────────────────────────
  // DEVICE MODELS
  // ──────────────────────────────────────────────

  @Post('device-models')
  @ApiOperation({ summary: 'Define new Device Model (Blueprint)' })
  createDeviceModel(@Body() body: CreateDeviceModelDto) {
    return this.adminService.createDeviceModel(body);
  }

  @Put('device-models/:code')
  @ApiOperation({
    summary: 'Update Device Model (name, config...)',
    description: 'Dùng khi cần cập nhật config cho model đã tồn tại.',
  })
  updateDeviceModel(
    @Param('code') code: string,
    @Body() body: CreateDeviceModelDto,
  ) {
    return this.adminService.updateDeviceModel(code, body);
  }

  @Get('options/device-models')
  @ApiOperation({ summary: 'Get Device Models for Dropdown' })
  getDeviceModelOptions() {
    return this.adminService.getDeviceModelsForDropdown();
  }

  @Delete('device-models/:code')
  @ApiOperation({ summary: 'Delete a Device Model' })
  deleteDeviceModel(@Param('code') code: string) {
    return this.adminService.deleteDeviceModel(code);
  }

  // ──────────────────────────────────────────────
  // QUOTAS
  // ──────────────────────────────────────────────

  @Get('quotas')
  @ApiOperation({ summary: 'List all quotas (raw)' })
  getQuotas() {
    return this.adminService.getAllQuotas();
  }

  // ──────────────────────────────────────────────
  // SYSTEM CONFIGS
  // ──────────────────────────────────────────────

  @Post('configs/mqtt')
  @ApiOperation({ summary: 'Quick-set MQTT Host/User/Pass' })
  setMqttConfig(@Body() body: SetMqttConfigDto) {
    return this.adminService.setMqttConfig(body);
  }

  @Get('configs')
  @ApiOperation({ summary: 'Get all system configs (MQTT, OTP...)' })
  @ApiResponse({ status: 200, type: SystemConfigResponseDto })
  getSystemConfigs(): Promise<SystemConfigResponseDto> {
    return this.adminService.getSystemConfigs();
  }

  @Put('configs')
  @ApiOperation({ summary: 'Update system configs' })
  updateSystemConfigs(@Body() body: UpdateSystemConfigDto) {
    return this.adminService.updateSystemConfigs(body);
  }

  // ──────────────────────────────────────────────
  // DEVICE UI CONFIG
  // ──────────────────────────────────────────────

  @Get('configs/device-ui')
  @ApiOperation({
    summary: 'Get device UI config',
    description:
      'Returns current device UI config from DB (or defaults if not set)',
  })
  getDeviceUiConfig() {
    return this.adminService.getDeviceUiConfig();
  }

  @Put('configs/device-ui')
  @ApiOperation({
    summary: 'Update device UI config',
    description:
      'Replaces entire device UI config in DB and refreshes Redis cache immediately',
  })
  updateDeviceUiConfig(@Body() body: UpdateDeviceUiConfigDto) {
    return this.adminService.updateDeviceUiConfig(body);
  }
}
