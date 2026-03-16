import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
    IsEnum,
    IsNotEmpty,
    IsOptional,
    IsString,
    IsUUID,
    Matches,
    ValidateIf,
} from 'class-validator';

// 1. Enum định nghĩa các giao thức hỗ trợ
export enum DeviceProtocol {
    MQTT = 'MQTT', // Thiết bị dùng Wifi (ESP32/8266)
    GSM_4G = 'GSM_4G', // Thiết bị dùng Sim 4G
    ZIGBEE = 'ZIGBEE', // Thiết bị qua Hub Zigbee
    VIRTUAL = 'VIRTUAL', // Thiết bị ảo (Test)
}

// 2. Class DTO cho việc đăng ký
export class RegisterDeviceDto {
    // --- PHẦN 1: THÔNG TIN KỸ THUẬT (Đọc từ Chip) ---

    @ApiProperty({
        description: 'Giao thức kết nối của thiết bị',
        enum: DeviceProtocol,
        example: DeviceProtocol.MQTT,
    })
    @IsEnum(DeviceProtocol)
    @IsNotEmpty()
    protocol: DeviceProtocol;

    @ApiProperty({
        description:
            'Định danh phần cứng duy nhất (MAC Address, IMEI, Serial...)',
        example: 'AA:BB:CC:11:22:33',
    })
    @IsString()
    @IsNotEmpty()
    // Logic: Nếu là WiFi -> Bắt buộc đúng format MAC Address
    @ValidateIf(o => o.protocol === DeviceProtocol.MQTT)
    @Matches(/^([0-9A-Fa-f]{2}[:-]){5}[0-9A-Fa-f]{2}$|^[0-9A-Fa-f]{12}$/, {
        message:
            'Identifier must be a valid MAC Address (e.g. AA:BB:CC:11:22:33 or AABBCC112233)',
    })
    // Logic: Nếu là GSM -> Bắt buộc đúng format IMEI (15 số)
    @ValidateIf(o => o.protocol === DeviceProtocol.GSM_4G)
    @Matches(/^[0-9]{15}$/, {
        message: 'Identifier must be a valid 15-digit IMEI',
    })
    identifier: string;

    @ApiProperty({
        description: 'Mã Model thiết bị (được nạp cứng trong firmware)',
        example: 'WIFI_SWITCH_4',
    })
    @IsString()
    @IsNotEmpty()
    deviceCode: string;

    @ApiProperty({
        description: 'Mã Công ty/Đối tác (Namespace Topic)',
        example: '123a',
    })
    @IsString()
    @IsNotEmpty()
    partnerCode: string;

    // --- PHẦN 2: THÔNG TIN NGƯỜI DÙNG (Nhập từ App) ---

    @ApiProperty({
        description: 'Tên thiết bị do người dùng đặt',
        example: 'Đèn phòng khách',
    })
    @IsString()
    @IsNotEmpty()
    name: string;

    @ApiPropertyOptional({
        description: 'ID của Nhà (Home) mà thiết bị thuộc về',
        example: '550e8400-e29b-41d4-a716-446655440000',
    })
    @IsOptional()
    @IsUUID()
    homeId?: string;

    @ApiPropertyOptional({
        description: 'ID của Phòng (Room) mà thiết bị thuộc về',
        example: '550e8400-e29b-41d4-a716-446655440000',
    })
    @IsOptional()
    @IsUUID()
    roomId?: string;
}
