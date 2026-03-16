import { Queue } from 'bullmq';
import { DatabaseService } from '@app/database';
import { HelperEncryptionService } from '../../helper/services/helper.encryption.service';
import { IAuthUser } from '../../request/interfaces/request.interface';
import { VietguysService } from '../../vietguys/vietguys.service';
import { SmsSimService } from '../../sms-sim/sms-sim.service';
import { UserLoginDto } from '../dtos/request/auth.login.dto';
import { UserCreateDto } from '../dtos/request/auth.signup.dto';
import { CheckExistsDto } from '../dtos/request/auth.check-exists.dto';
import { ForgotPasswordDto } from '../dtos/request/forgot.password.dto';
import { VerifyOtpDto } from '../dtos/request/verify-otp.dto';
import { ResetPasswordDto } from '../dtos/request/reset-password.dto';
import { ChangePasswordDto } from '../dtos/request/change.password.dto';
import {
  AuthRefreshResponseDto,
  AuthResponseDto,
} from '../dtos/response/auth.response.dto';
import { IAuthService } from '../interfaces/auth.service.interface';
export declare class AuthService implements IAuthService {
  private readonly databaseService;
  private readonly helperEncryptionService;
  private readonly vietguysService;
  private readonly smsSimService;
  private readonly emailQueue;
  private readonly logger;
  constructor(
    databaseService: DatabaseService,
    helperEncryptionService: HelperEncryptionService,
    vietguysService: VietguysService,
    smsSimService: SmsSimService,
    emailQueue: Queue,
  );
  login(data: UserLoginDto): Promise<AuthResponseDto>;
  checkExists(data: CheckExistsDto): Promise<{
    exists: boolean;
  }>;
  signup(data: UserCreateDto): Promise<AuthResponseDto>;
  refreshTokens(payload: IAuthUser): Promise<AuthRefreshResponseDto>;
  forgotPassword(data: ForgotPasswordDto): Promise<void>;
  verifyOtp(data: VerifyOtpDto): Promise<{
    resetToken: string;
  }>;
  resetPassword(data: ResetPasswordDto): Promise<void>;
  changePassword(userId: string, data: ChangePasswordDto): Promise<void>;
}
