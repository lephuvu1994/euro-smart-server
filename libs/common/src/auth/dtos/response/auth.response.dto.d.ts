import { UserResponseDto } from '../../../dtos/user.response.dto';
export declare class TokenDto {
    accessToken: string;
    refreshToken: string;
}
export declare class AuthResponseDto extends TokenDto {
    user: UserResponseDto;
}
export declare class AuthRefreshResponseDto extends TokenDto {
}
