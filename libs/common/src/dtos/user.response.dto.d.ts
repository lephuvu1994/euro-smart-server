import { $Enums } from '@prisma/client';
import { HomeResponseDto } from './home.response.dto';
export declare class UserResponseDto {
    id: string;
    email: string | null;
    phone: string | null;
    firstName: string | null;
    lastName: string | null;
    avatar: string | null;
    userName?: string | null;
    role: $Enums.UserRole;
    lastLatitude?: number;
    lastLongitude?: number;
    lastLocationChanged?: Date;
    createdAt: Date;
    updatedAt: Date;
    password?: string;
}
export declare class UserGetProfileResponseDto extends UserResponseDto {
    homes: HomeResponseDto[];
}
export declare class UserUpdateProfileResponseDto extends UserResponseDto {
}
