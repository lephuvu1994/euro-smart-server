import { IAuthUser } from '../../request/interfaces/request.interface';
import { UserLoginDto } from '../dtos/request/auth.login.dto';
import { UserCreateDto } from '../dtos/request/auth.signup.dto';
import { CheckExistsDto } from '../dtos/request/auth.check-exists.dto';
import { ForgotPasswordDto } from '../dtos/request/forgot.password.dto';
import { VerifyOtpDto } from '../dtos/request/verify-otp.dto';
import { ResetPasswordDto } from '../dtos/request/reset-password.dto';
import { AuthRefreshResponseDto, AuthResponseDto } from '../dtos/response/auth.response.dto';
import { AuthService } from '../services/auth.service';
export declare class AuthPublicController {
    private readonly authService;
    constructor(authService: AuthService);
    login(payload: UserLoginDto): Promise<AuthResponseDto>;
    signup(payload: UserCreateDto): Promise<AuthResponseDto>;
    checkExists(payload: CheckExistsDto): Promise<{
        exists: boolean;
    }>;
    refreshTokens(user: IAuthUser): Promise<AuthRefreshResponseDto>;
    forgotPassword(payload: ForgotPasswordDto): Promise<void>;
    verifyOtp(payload: VerifyOtpDto): Promise<{
        resetToken: string;
    }>;
    resetPassword(payload: ResetPasswordDto): Promise<void>;
}
