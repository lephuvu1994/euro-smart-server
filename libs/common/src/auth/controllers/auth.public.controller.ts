import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Post,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';

import { DocResponse } from '../../doc/decorators/doc.response.decorator';
import { PublicRoute } from '../../request/decorators/request.public.decorator';
import { AuthUser } from '../../request/decorators/request.user.decorator';
import { JwtRefreshGuard } from '../../request/guards/jwt.refresh.guard';
import { IAuthUser } from '../../request/interfaces/request.interface';

import { UserLoginDto } from '../dtos/request/auth.login.dto';
import { UserCreateDto } from '../dtos/request/auth.signup.dto';
import { CheckExistsDto } from '../dtos/request/auth.check-exists.dto';
import { ForgotPasswordDto } from '../dtos/request/forgot.password.dto';
import { VerifyOtpDto } from '../dtos/request/verify-otp.dto';
import { ResetPasswordDto } from '../dtos/request/reset-password.dto';

import {
  AuthRefreshResponseDto,
  AuthResponseDto,
} from '../dtos/response/auth.response.dto';
import { AuthService } from '../services/auth.service';

@ApiTags('public.auth')
@Controller({
  version: '1',
  path: '/auth',
})
export class AuthPublicController {
  constructor(private readonly authService: AuthService) {}

  // --- LOGIN (Hỗ trợ Email hoặc Phone) ---
  @Post('login')
  @HttpCode(HttpStatus.OK)
  @PublicRoute()
  @ApiOperation({
    summary: 'Login with Email or Phone',
    description: 'Đăng nhập bằng Email hoặc Số điện thoại và Mật khẩu.',
  })
  @DocResponse({
    serialization: AuthResponseDto,
    httpStatus: HttpStatus.OK,
    messageKey: 'auth.login.success',
  })
  public login(@Body() payload: UserLoginDto): Promise<AuthResponseDto> {
    return this.authService.login(payload);
  }

  // --- SIGNUP (Không cần verify) ---
  @Post('signup')
  @PublicRoute()
  @ApiOperation({
    summary: 'Register new user',
    description:
      'Đăng ký tài khoản mới (Email hoặc Phone là bắt buộc). Tự động đăng nhập sau khi đăng ký.',
  })
  @DocResponse({
    serialization: AuthResponseDto,
    httpStatus: HttpStatus.CREATED, // 201 Created
    messageKey: 'auth.signup.success',
  })
  public signup(@Body() payload: UserCreateDto): Promise<AuthResponseDto> {
    return this.authService.signup(payload);
  }

  // --- CHECK EXISTS (Kiểm tra tài khoản đã tồn tại) ---
  @Post('check-exists')
  @HttpCode(HttpStatus.OK)
  @PublicRoute()
  @ApiOperation({
    summary: 'Check if account exists',
    description:
      'Kiểm tra Email hoặc Số điện thoại đã đăng ký chưa. Trả về { exists: true/false }.',
  })
  public checkExists(
    @Body() payload: CheckExistsDto,
  ): Promise<{ exists: boolean }> {
    return this.authService.checkExists(payload);
  }

  // --- REFRESH TOKEN ---
  @Get('refresh-token')
  @PublicRoute() // Route này public về mặt AuthGuard chính, nhưng dùng JwtRefreshGuard riêng
  @UseGuards(JwtRefreshGuard)
  @ApiBearerAuth('refreshToken') // Yêu cầu Swagger hiện nút nhập token (cấu hình trong main.ts)
  @ApiOperation({
    summary: 'Refresh Access Token',
    description: 'Sử dụng Refresh Token để lấy cặp Access/Refresh Token mới.',
  })
  @DocResponse({
    serialization: AuthRefreshResponseDto,
    httpStatus: HttpStatus.OK, // Thường refresh trả về 200 OK
    messageKey: 'auth.refresh.success',
  })
  public refreshTokens(
    @AuthUser() user: IAuthUser,
  ): Promise<AuthRefreshResponseDto> {
    return this.authService.refreshTokens(user);
  }

  // --- FORGOT PASSWORD (Bước 1: Request OTP) ---
  @Post('forgot-password')
  @PublicRoute()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Quên mật khẩu (Bước 1: Request OTP)',
    description:
      'Nhận identifier là Email hoặc Số điện thoại. USB SIM sẽ được thử trước cho SĐT.',
  })
  @DocResponse({
    httpStatus: HttpStatus.OK,
    messageKey: 'auth.forgotPassword.requested',
  })
  public forgotPassword(@Body() payload: ForgotPasswordDto): Promise<void> {
    return this.authService.forgotPassword(payload);
  }

  // --- VERIFY OTP (Bước 2: Xác thực OTP) ---
  @Post('forgot-password/verify')
  @PublicRoute()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Quên mật khẩu (Bước 2: Verify OTP)',
    description:
      'Xác thực mã OTP. Trả về resetToken (có hiệu lực 5 phút) để dùng cho bước đặt lại mật khẩu.',
  })
  @DocResponse({
    httpStatus: HttpStatus.OK,
    messageKey: 'auth.verifyOtp.success',
  })
  public verifyOtp(
    @Body() payload: VerifyOtpDto,
  ): Promise<{ resetToken: string }> {
    return this.authService.verifyOtp(payload);
  }

  // --- RESET PASSWORD (Bước 3: Đặt lại mật khẩu sau khi OTP verified) ---
  @Post('forgot-password/reset-password')
  @PublicRoute()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Quên mật khẩu (Bước 3: Đặt lại mật khẩu)',
    description:
      'Đặt lại mật khẩu mới. Chỉ cho phép sau khi OTP đã được xác thực thành công.',
  })
  @DocResponse({
    httpStatus: HttpStatus.OK,
    messageKey: 'auth.resetPassword.success',
  })
  public resetPassword(@Body() payload: ResetPasswordDto): Promise<void> {
    return this.authService.resetPassword(payload);
  }
}
