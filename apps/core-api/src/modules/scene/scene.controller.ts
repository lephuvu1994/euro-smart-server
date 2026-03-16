import {
    Body,
    Controller,
    Get,
    HttpStatus,
    Param,
    Patch,
    Post,
    Query,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { DocResponse } from '@app/common/doc/decorators/doc.response.decorator';
import { AuthUser } from '@app/common/request/decorators/request.user.decorator';
import { JwtAccessGuard } from '@app/common/request/guards/jwt.access.guard';
import { RolesGuard } from '@app/common/request/guards/roles.guard';
import { IAuthUser } from '@app/common/request/interfaces/request.interface';
import { UseGuards } from '@nestjs/common';
import {
    CreateSceneDto,
    LocationReportDto,
    UpdateSceneDto,
} from './dtos/request';
import { SceneResponseDto } from './dtos/response/scene.response';
import { SceneTriggerLocationService } from './services/scene-trigger-location.service';
import { SceneService } from './scene.service';

@ApiTags('Scene')
@UseGuards(JwtAccessGuard, RolesGuard)
@ApiBearerAuth('accessToken')
@Controller({ path: 'scenes', version: '1' })
export class SceneController {
    constructor(
        private readonly sceneService: SceneService,
        private readonly sceneTriggerLocationService: SceneTriggerLocationService
    ) {}

    @Post('triggers/location')
    @ApiOperation({
        summary:
            'Báo vị trí user (geofence) – kích hoạt scene LOCATION enter/leave',
    })
    async reportLocation(
        @AuthUser() user: IAuthUser,
        @Body() dto: LocationReportDto
    ): Promise<{ ok: boolean }> {
        await this.sceneTriggerLocationService.onLocationReport(
            user.userId,
            dto.latitude,
            dto.longitude
        );
        return { ok: true };
    }

    @Get()
    @ApiOperation({ summary: 'Lấy danh sách scene theo home' })
    @DocResponse({
        serialization: SceneResponseDto,
        httpStatus: HttpStatus.OK,
        messageKey: 'scene.success.list',
    })
    async getScenes(
        @AuthUser() user: IAuthUser,
        @Query('homeId') homeId: string
    ): Promise<SceneResponseDto[]> {
        return this.sceneService.getScenesByHome(homeId, user.userId);
    }

    @Get(':sceneId')
    @ApiOperation({ summary: 'Lấy chi tiết một scene' })
    @DocResponse({
        serialization: SceneResponseDto,
        httpStatus: HttpStatus.OK,
        messageKey: 'scene.success.detail',
    })
    async getScene(
        @AuthUser() user: IAuthUser,
        @Param('sceneId') sceneId: string
    ): Promise<SceneResponseDto> {
        return this.sceneService.getScene(sceneId, user.userId);
    }

    @Post()
    @ApiOperation({ summary: 'Tạo scene mới (theo home)' })
    @DocResponse({
        serialization: SceneResponseDto,
        httpStatus: HttpStatus.CREATED,
        messageKey: 'scene.success.created',
    })
    async createScene(
        @AuthUser() user: IAuthUser,
        @Body() dto: CreateSceneDto
    ): Promise<SceneResponseDto> {
        return this.sceneService.createScene(dto.homeId, user.userId, dto);
    }

    @Patch(':sceneId')
    @ApiOperation({ summary: 'Cập nhật scene' })
    @DocResponse({
        serialization: SceneResponseDto,
        httpStatus: HttpStatus.OK,
        messageKey: 'scene.success.updated',
    })
    async updateScene(
        @AuthUser() user: IAuthUser,
        @Param('sceneId') sceneId: string,
        @Body() dto: UpdateSceneDto
    ): Promise<SceneResponseDto> {
        return this.sceneService.updateScene(sceneId, user.userId, dto);
    }

    @Post(':sceneId/run')
    @ApiOperation({ summary: 'Chạy scene (đẩy job thực thi các action)' })
    @DocResponse({
        serialization: Object,
        httpStatus: HttpStatus.OK,
        messageKey: 'scene.success.runQueued',
    })
    async runScene(
        @AuthUser() user: IAuthUser,
        @Param('sceneId') sceneId: string
    ): Promise<{ jobId: string; message: string }> {
        return this.sceneService.runScene(sceneId, user.userId);
    }
}
