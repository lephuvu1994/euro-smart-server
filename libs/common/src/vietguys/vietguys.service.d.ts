import { ConfigService } from '@nestjs/config';
export declare class VietguysService {
  private readonly configService;
  private readonly logger;
  constructor(configService: ConfigService);
  private cachedAccessToken;
  private cachedAccessTokenExpiredAtSec;
  get isEnabled(): boolean;
  normalizePhone(phone: string): string;
  sendOtp(phone: string, otp: string): Promise<void>;
  private isZaloEnabledAndConfigured;
  private isSmsEnabledAndConfigured;
  private isVoiceEnabledAndConfigured;
  private getAccessToken;
  private sendZaloZns;
  private sendVoiceOtp;
  private sendSms;
}
