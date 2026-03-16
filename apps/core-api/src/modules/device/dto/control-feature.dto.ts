import { IsNotEmpty, IsUUID } from 'class-validator';

export class ControlFeatureDto {
    @IsUUID()
    featureId: string; // Đây là UUID trong bảng DeviceFeature

    @IsNotEmpty()
    value: any; // 1, 0, "red", 50...
}
