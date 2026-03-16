// src/modules/device/dtos/claim-device.dto.ts
import { IsNotEmpty, IsOptional, IsString, IsUUID } from 'class-validator';

export class ClaimDeviceDto {
    @IsString()
    @IsNotEmpty()
    token: string; // Token mà Chip vừa nhận được sau khi provision

    @IsString()
    @IsNotEmpty()
    name: string; // Tên user đặt (VD: Đèn phòng ngủ)

    @IsOptional()
    @IsUUID()
    roomId?: string; // ID phòng (nếu có)

    @IsOptional()
    @IsUUID()
    homeId?: string; // ID nhà (nếu có)
}
