import { IAuthUser } from '../../request/interfaces/request.interface';

import {
    AuthRefreshResponseDto,
    AuthResponseDto,
} from '../dtos/response/auth.response.dto';
import { UserLoginDto } from '../dtos/request/auth.login.dto';
import { UserCreateDto } from '../dtos/request/auth.signup.dto';
import { ForgotPasswordDto } from '../dtos/request/forgot.password.dto';
import { VerifyOtpDto } from '../dtos/request/verify-otp.dto';
import { ResetPasswordDto } from '../dtos/request/reset-password.dto';
import { CheckExistsDto } from '../dtos/request/auth.check-exists.dto';

export interface IAuthService {
    login(data: UserLoginDto): Promise<AuthResponseDto>;
    signup(data: UserCreateDto): Promise<AuthResponseDto>;
    checkExists(data: CheckExistsDto): Promise<{ exists: boolean }>;
    refreshTokens(payload: IAuthUser): Promise<AuthRefreshResponseDto>;
    forgotPassword(data: ForgotPasswordDto): Promise<void>;
    verifyOtp(data: VerifyOtpDto): Promise<{ resetToken: string }>;
    resetPassword(data: ResetPasswordDto): Promise<void>;
}
