import { InjectQueue } from '@nestjs/bullmq';
import { HttpException, HttpStatus, Injectable, Logger } from '@nestjs/common';
import { UserRole } from '@prisma/client';
import { Queue } from 'bullmq';
import { plainToInstance } from 'class-transformer';
import { randomUUID } from 'crypto';

import { APP_BULLMQ_QUEUES } from '../../enums/app.enum';
import { DatabaseService } from '@app/database';
import {
  EmailTemplate,
  ISendEmailParams,
} from '../../helper/interfaces/email.interface';
import { HelperEncryptionService } from '../../helper/services/helper.encryption.service';
import { IAuthUser } from '../../request/interfaces/request.interface';
import { VietguysService } from '../../vietguys/vietguys.service';
import { SmsSimService } from '../../sms-sim/sms-sim.service';

// DTOs
import { UserLoginDto } from '../dtos/request/auth.login.dto';
import { UserCreateDto } from '../dtos/request/auth.signup.dto';
import { CheckExistsDto } from '../dtos/request/auth.check-exists.dto';
import { ForgotPasswordDto } from '../dtos/request/forgot.password.dto';
import { VerifyOtpDto } from '../dtos/request/verify-otp.dto';
import { ResetPasswordDto } from '../dtos/request/reset-password.dto';
import { ChangePasswordDto } from '../dtos/request/change.password.dto';
import {
  AuthMeResponseDto,
  AuthRefreshResponseDto,
  AuthResponseDto,
} from '../dtos/response/auth.response.dto';
import { UserResponseDto } from '../../dtos/user.response.dto';
import { IAuthService } from '../interfaces/auth.service.interface';

@Injectable()
export class AuthService implements IAuthService {
  private readonly logger = new Logger(AuthService.name);

  constructor(
    private readonly databaseService: DatabaseService,
    private readonly helperEncryptionService: HelperEncryptionService,
    private readonly vietguysService: VietguysService,
    private readonly smsSimService: SmsSimService,
    @InjectQueue(APP_BULLMQ_QUEUES.EMAIL)
    private readonly emailQueue: Queue,
  ) {}

  /**
   * 1. Đăng nhập (Email hoặc Phone)
   */
  public async login(data: UserLoginDto): Promise<AuthResponseDto> {
    const { identifier, password } = data;

    const user = await this.databaseService.user.findFirst({
      where: {
        OR: [{ email: identifier }, { phone: identifier }],
      },
    });

    if (!user) {
      throw new HttpException('auth.error.userNotFound', HttpStatus.NOT_FOUND);
    }

    const passwordMatched = await this.helperEncryptionService.match(
      user.password,
      password,
    );

    if (!passwordMatched) {
      throw new HttpException(
        'auth.error.invalidPassword',
        HttpStatus.BAD_REQUEST,
      );
    }

    const tokens = await this.helperEncryptionService.createJwtTokens({
      role: user.role,
      userId: user.id,
    });

    const userDto = plainToInstance(
      UserResponseDto,
      {
        ...user,
        avatar: null,
        userName: user.email ? user.email.split('@')[0] : user.phone,
      },
      {
        excludeExtraneousValues: true,
      },
    );

    const homes = await this.getUserHomes(user.id);

    return {
      ...tokens,
      user: userDto,
      homes,
    };
  }

  /**
   * 1b. Kiểm tra tài khoản tồn tại (Email hoặc Phone)
   */
  public async checkExists(data: CheckExistsDto): Promise<{ exists: boolean }> {
    const { identifier } = data;

    const user = await this.databaseService.user.findFirst({
      where: {
        OR: [{ email: identifier }, { phone: identifier }],
      },
      select: { id: true },
    });

    return { exists: !!user };
  }

  /**
   * 1c. Lấy thông tin User và Homes hiện tại
   */
  public async getMe(userId: string): Promise<AuthMeResponseDto> {
    const user = await this.databaseService.user.findUnique({
      where: { id: userId },
    });

    if (!user) {
      throw new HttpException('auth.error.userNotFound', HttpStatus.NOT_FOUND);
    }

    const userDto = plainToInstance(
      UserResponseDto,
      {
        ...user,
        avatar: null,
        userName: user.email ? user.email.split('@')[0] : user.phone,
      },
      {
        excludeExtraneousValues: true,
      },
    );

    const homes = await this.getUserHomes(user.id);

    return {
      user: userDto,
      homes,
    };
  }

  /**
   * 2. Đăng ký (Không cần verify)
   */
  public async signup(data: UserCreateDto): Promise<AuthResponseDto> {
    const { identifier, firstName, lastName, password } = data;

    // Auto-detect: email hoặc phone
    const isEmail = identifier.includes('@');
    const email = isEmail ? identifier : null;
    const phone = !isEmail ? identifier : null;

    // Check trùng lặp
    const existingUser = await this.databaseService.user.findFirst({
      where: { [isEmail ? 'email' : 'phone']: identifier },
    });

    if (existingUser) {
      throw new HttpException('user.error.userExists', HttpStatus.CONFLICT);
    }

    const hashed = await this.helperEncryptionService.createHash(password);

    const createdUser = await this.databaseService.user.create({
      data: {
        email,
        phone,
        password: hashed,
        firstName: firstName?.trim(),
        lastName: lastName?.trim(),
        role: UserRole.USER,
      },
    });

    // Tạo nhà mặc định cho user lần đầu đăng ký
    const defaultHome = await this.databaseService.home.create({
      data: {
        name: 'Nhà của tôi',
        ownerId: createdUser.id,
      },
    });
    await this.databaseService.homeMember.create({
      data: {
        userId: createdUser.id,
        homeId: defaultHome.id,
        role: 'OWNER',
      },
    });

    const tokens = await this.helperEncryptionService.createJwtTokens({
      role: createdUser.role,
      userId: createdUser.id,
    });

    // Chỉ gửi mail nếu đăng ký bằng email
    if (email) {
      const emailJobPayload: Partial<ISendEmailParams> = {
        to: email,
        context: {
          userName: `${firstName} ${lastName}`.trim() || 'User',
        },
      };

      await this.emailQueue.add(EmailTemplate.WELCOME, emailJobPayload, {
        delay: 5000,
        removeOnComplete: true,
        attempts: 3,
        backoff: {
          type: 'exponential',
          delay: 2000,
        },
      });
    }

    const userDto = plainToInstance(
      UserResponseDto,
      {
        ...createdUser,
        avatar: null,
        userName: email ? email.split('@')[0] : phone,
      },
      {
        excludeExtraneousValues: true,
      },
    );

    // Trả về home vừa tạo
    const homes = [
      { id: defaultHome.id, name: defaultHome.name, role: 'OWNER' },
    ];

    return {
      ...tokens,
      user: userDto,
      homes,
    };
  }

  /**
   * 3. Refresh Token
   */
  public async refreshTokens(
    payload: IAuthUser,
  ): Promise<AuthRefreshResponseDto> {
    return this.helperEncryptionService.createJwtTokens({
      userId: payload.userId,
      role: payload.role,
    });
  }

  /**
   * 4. Quên mật khẩu (Bước 1: Gửi OTP - Hybrid flow)
   */
  public async forgotPassword(data: ForgotPasswordDto): Promise<void> {
    const { identifier } = data;
    const isEmail = identifier.includes('@');

    const user = await this.databaseService.user.findFirst({
      where: { [isEmail ? 'email' : 'phone']: identifier },
    });

    if (!user) {
      throw new HttpException('user.error.notFound', HttpStatus.NOT_FOUND);
    }

    let otp: string | null = null;
    let provider = isEmail ? 'EMAIL' : 'SMS_SIM';

    // A. Xử lý gửi OTP dựa trên provider
    if (isEmail) {
      otp = Math.floor(100000 + Math.random() * 900000).toString();
    } else {
      otp = Math.floor(100000 + Math.random() * 900000).toString();
      try {
        // Thử gửi qua USB SIM modem trước
        await this.smsSimService.sendSms(
          user.phone!,
          `Ma OTP cua ban la: ${otp}`,
        );
      } catch (error) {
        this.logger.warn(
          `[AuthService] SMS SIM failed: ${error.message}. Falling back to Vietguys.`,
        );
        provider = 'VIETGUYS';
      }
    }

    // B. Lưu trạng thái OTP vào DB
    const config = await this.databaseService.systemConfig.findUnique({
      where: { key: 'OTP_EXPIRE' },
    });
    const expireMinutes = config ? parseInt(config.value, 10) : 5;
    const otpExpire = new Date(Date.now() + expireMinutes * 60 * 1000);

    await this.databaseService.user.update({
      where: { id: user.id },
      data: {
        otpCode: otp,
        otpExpire: otpExpire,
        otpProvider: provider,
      },
    });

    // C. Gửi message (Nếu không phải Firebase vì Firebase tự gửi rồi)
    if (provider === 'EMAIL') {
      await this.emailQueue.add(
        EmailTemplate.FORGOT_PASSWORD,
        {
          to: user.email,
          context: {
            userName: `${user.firstName} ${user.lastName}`,
            otp,
          },
        },
        { removeOnComplete: true, attempts: 3, priority: 1 },
      );
    } else if (provider === 'VIETGUYS') {
      await this.vietguysService.sendOtp(user.phone!, otp!);
    }
  }

  /**
   * 5a. Quên mật khẩu (Bước 2: Verify OTP only)
   * Returns a resetToken for the next step.
   */
  public async verifyOtp(data: VerifyOtpDto): Promise<{ resetToken: string }> {
    const { identifier, otp } = data;
    const isEmail = identifier.includes('@');

    const user = await this.databaseService.user.findFirst({
      where: { [isEmail ? 'email' : 'phone']: identifier },
    });

    if (!user || !user.otpProvider) {
      throw new HttpException('auth.error.otpExpired', HttpStatus.BAD_REQUEST);
    }

    // Verify OTP
    if (
      user.otpCode !== otp ||
      !user.otpExpire ||
      user.otpExpire < new Date()
    ) {
      throw new HttpException('auth.error.invalidOtp', HttpStatus.BAD_REQUEST);
    }

    // OTP valid → generate resetToken with 5-minute expiry
    const resetToken = randomUUID();
    const resetExpire = new Date(Date.now() + 5 * 60 * 1000); // 5 minutes

    await this.databaseService.user.update({
      where: { id: user.id },
      data: {
        otpCode: resetToken,
        otpExpire: resetExpire,
        otpProvider: 'VERIFIED',
      },
    });

    return { resetToken };
  }

  /**
   * 5b. Quên mật khẩu (Bước 3: Reset Password after OTP verified)
   * Requires resetToken from verifyOtp step.
   */
  public async resetPassword(data: ResetPasswordDto): Promise<void> {
    const { identifier, newPassword, resetToken } = data;
    const isEmail = identifier.includes('@');

    const user = await this.databaseService.user.findFirst({
      where: { [isEmail ? 'email' : 'phone']: identifier },
    });

    if (!user || user.otpProvider !== 'VERIFIED') {
      throw new HttpException(
        'auth.error.otpNotVerified',
        HttpStatus.BAD_REQUEST,
      );
    }

    // Validate resetToken and expiry
    if (
      user.otpCode !== resetToken ||
      !user.otpExpire ||
      user.otpExpire < new Date()
    ) {
      throw new HttpException(
        'auth.error.resetTokenExpired',
        HttpStatus.BAD_REQUEST,
      );
    }

    // Hash & update password, clear OTP state
    const hashedPassword =
      await this.helperEncryptionService.createHash(newPassword);
    await this.databaseService.user.update({
      where: { id: user.id },
      data: {
        password: hashedPassword,
        otpCode: null,
        otpExpire: null,
        otpProvider: null,
      },
    });
  }

  /**
   * 6. Đổi mật khẩu (Dành cho user đã login)
   */
  async changePassword(userId: string, data: ChangePasswordDto): Promise<void> {
    const { oldPassword, newPassword } = data;

    // 1. Tìm user
    const user = await this.databaseService.user.findUnique({
      where: { id: userId },
    });

    if (!user) {
      throw new HttpException('user.error.notFound', HttpStatus.NOT_FOUND);
    }

    // 2. Kiểm tra mật khẩu cũ có khớp không
    const isMatch = await this.helperEncryptionService.match(
      user.password,
      oldPassword,
    );

    if (!isMatch) {
      throw new HttpException(
        'auth.error.invalidOldPassword',
        HttpStatus.BAD_REQUEST,
      );
    }

    // 3. Hash mật khẩu mới và lưu
    const hashedPassword =
      await this.helperEncryptionService.createHash(newPassword);
    await this.databaseService.user.update({
      where: { id: userId },
      data: { password: hashedPassword },
    });
  }

  /**
   * Helper: Lấy danh sách homes của user (owner + member)
   */
  private async getUserHomes(userId: string) {
    const memberships = await this.databaseService.homeMember.findMany({
      where: { userId },
      select: {
        role: true,
        home: { select: { id: true, name: true } },
      },
    });

    return memberships.map((m) => ({
      id: m.home.id,
      name: m.home.name,
      role: m.role,
    }));
  }
}
