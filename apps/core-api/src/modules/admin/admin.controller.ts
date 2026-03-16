import {
    Body,
    Controller,
    Get,
    Param,
    Post,
    Put,
    UseGuards,
} from '@nestjs/common';
import {
    ApiBearerAuth,
    ApiOperation,
    ApiTags,
    ApiResponse,
} from '@nestjs/swagger';
import { UserRole } from '@prisma/client';

import { AdminService } from './admin.service';

// DTO Requests
import { CreateDeviceModelDto } from './dtos/request/create-model.dto';
import { CreatePartnerDto } from './dtos/request/create-partner.dto';

// [NEW] Import DTO Response vừa tạo
import { PartnerUsageResponseDto } from './dtos/response/partner-usage.response.dto';

// Guards & Decorators
import { RolesGuard } from '@app/common/request/guards/roles.guard';
import { JwtAccessGuard } from '@app/common/request/guards/jwt.access.guard';
import { AllowedRoles } from '@app/common/request/decorators/request.role.decorator';
import { UpdatePartnerDto } from './dtos/request/update-partner-full.dto';
import { SetMqttConfigDto } from './dtos/request/set-mqtt-config.dto';
import { SystemConfigResponseDto } from './dtos/response/system-config.response.dto';
import { UpdateSystemConfigDto } from './dtos/request/update-system-config.dto';

@ApiTags('admin.metadata')
@Controller({
    version: '1',
    path: '/admin',
})
@UseGuards(JwtAccessGuard, RolesGuard)
@ApiBearerAuth('accessToken')
@AllowedRoles([UserRole.ADMIN]) // Chỉ Admin được gọi tất cả API trong này
export class AdminController {
    constructor(private readonly adminService: AdminService) {}

    // 1. Tạo Công Ty
    @Post('partners')
    @ApiOperation({ summary: 'Create new Partner/Company' })
    createPartner(@Body() body: CreatePartnerDto) {
        return this.adminService.createPartner(body);
    }

    // 2. Tạo Model Thiết Bị
    @Post('device-models')
    @ApiOperation({ summary: 'Define new Device Model' })
    createDeviceModel(@Body() body: CreateDeviceModelDto) {
        return this.adminService.createDeviceModel(body);
    }

    // 4. Xem danh sách cấp phép (Cũ - Có thể giữ lại hoặc bỏ nếu hàm mới đã bao gồm)
    @Get('quotas')
    @ApiOperation({ summary: 'List all quotas raw data' })
    getQuotas() {
        return this.adminService.getAllQuotas();
    }

    @Get('options/device-models')
    @ApiOperation({
        summary: 'Get Device Models for Dropdown',
        description:
            'Lấy danh sách Code & Name của thiết bị để hiển thị vào thẻ Select.',
    })
    getDeviceModelOptions() {
        return this.adminService.getDeviceModelsForDropdown();
    }

    @Get('options/partners')
    @ApiOperation({
        summary: 'Get Partners for Dropdown',
        description:
            'Lấy danh sách Code & Name của công ty để hiển thị vào thẻ Select.',
    })
    getPartnerOptions() {
        return this.adminService.getPartnersForDropdown();
    }

    // [NEW] 5. Xem thống kê chi tiết (API bạn cần)
    @Get('stats/partners')
    @ApiOperation({
        summary: 'Get Partners usage statistics',
        description:
            'Lấy danh sách công ty kèm theo tình trạng sử dụng quota (Used/Total) của từng loại thiết bị.',
    })
    @ApiResponse({
        status: 200,
        description: 'Successful response',
        type: [PartnerUsageResponseDto], // Khai báo type để Swagger hiện model mẫu
    })
    getPartnersUsage(): Promise<PartnerUsageResponseDto[]> {
        return this.adminService.getPartnersUsage();
    }

    // GIỮ LẠI: API Update duy nhất
    @Put('partners/:code')
    @ApiOperation({
        summary: 'Update Partner Info',
        description:
            'API đa năng: Có thể dùng để sửa tên, sửa quota, hoặc sửa cả hai cùng lúc.',
    })
    updatePartner(
        @Param('code') code: string,
        @Body() body: UpdatePartnerDto // DTO đã set optional
    ) {
        return this.adminService.updatePartner(code, body);
    }
    @Post('configs/mqtt')
    @ApiOperation({
        summary: 'Update all MQTT configs at once',
        description: 'Cập nhật nhanh Host, User, Pass của MQTT Broker.',
    })
    setMqttConfig(@Body() body: SetMqttConfigDto) {
        return this.adminService.setMqttConfig(body);
    }

    @Get('configs')
    @ApiOperation({
        summary: 'Get all system configurations',
        description: 'Lấy toàn bộ cấu hình hệ thống bao gồm MQTT và OTP.',
    })
    @ApiResponse({
        status: 200,
        type: SystemConfigResponseDto,
    })
    getSystemConfigs(): Promise<SystemConfigResponseDto> {
        return this.adminService.getSystemConfigs();
    }

    @Put('configs')
    @ApiOperation({
        summary: 'Update system configurations',
        description: 'Cập nhật cấu hình hệ thống (MQTT, OTP...).',
    })
    updateSystemConfigs(@Body() body: UpdateSystemConfigDto) {
        return this.adminService.updateSystemConfigs(body);
    }
}
