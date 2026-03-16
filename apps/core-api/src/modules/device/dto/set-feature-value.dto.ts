// src/modules/device/dto/set-feature-value.dto.ts
import { IsDefined, IsNotEmpty } from 'class-validator';

export class SetFeatureValueDto {
    @IsDefined({ message: 'Giá trị điều khiển không được để trống' })
    @IsNotEmpty()
    value: any; // Có thể là number (Dimmer), boolean/number (Binary), string (Shutter)
}
