import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { randomUUID } from 'crypto';

/**
 * VietGuys OTP integration (đa kênh).
 *
 * Thứ tự ưu tiên:
 * 1) Zalo ZNS (ZBS) – template (OTP do BE tạo)
 * 2) Voice OTP (placeholder: cần VietGuys cung cấp endpoint/payload)
 * 3) SMS Brandname (CSKH)
 *
 * Docs:
 * - Token: https://developers.vietguys.biz/#h-ng-d-n-l-y-refresh-token
 * - Zalo ZBS: https://developers.vietguys.biz/#zalo
 * - SMS Brandname: https://developers.vietguys.biz/#sms-brandname
 */
@Injectable()
export class VietguysService {
  private readonly logger = new Logger(VietguysService.name);

  constructor(private readonly configService: ConfigService) {}

  private cachedAccessToken: string | null = null;
  private cachedAccessTokenExpiredAtSec: number | null = null;

  get isEnabled(): boolean {
    const enabled = this.configService.get<boolean | string>(
      'vietguys.enabled',
    );
    return enabled === true || enabled === 'true';
  }

  /**
   * Chuẩn hóa số điện thoại VN sang dạng 84xxxxxxxxx.
   */
  normalizePhone(phone: string): string {
    const digits = phone.replace(/\D/g, '');
    if (digits.startsWith('84')) return digits;
    if (digits.startsWith('0')) return '84' + digits.slice(1);
    return '84' + digits;
  }

  /**
   * Gửi OTP đa kênh theo thứ tự: Zalo → Voice → SMS.
   * Nếu VietGuys bị tắt hoặc thiếu cấu hình cho từng kênh thì sẽ tự skip kênh đó.
   * Ném lỗi nếu đã thử các kênh khả dụng mà vẫn thất bại.
   */
  async sendOtp(phone: string, otp: string): Promise<void> {
    if (!this.isEnabled) {
      this.logger.warn(`[VietGuys] Disabled. Mock OTP to ${phone}: ${otp}`);
      return;
    }

    const errors: Array<{ channel: string; error: unknown }> = [];

    // 1) Zalo
    try {
      await this.sendZaloZns(phone, otp);
      return;
    } catch (e) {
      errors.push({ channel: 'zalo', error: e });
    }

    // 2) Voice (placeholder)
    try {
      await this.sendVoiceOtp(phone, otp);
      return;
    } catch (e) {
      errors.push({ channel: 'voice', error: e });
    }

    // 3) SMS
    try {
      await this.sendSms(phone, otp);
      return;
    } catch (e) {
      errors.push({ channel: 'sms', error: e });
    }

    const msg = errors
      .map(
        (x) =>
          `${x.channel}: ${x.error instanceof Error ? x.error.message : String(x.error)}`,
      )
      .join(' | ');
    throw new Error(`[VietGuys] All channels failed. ${msg}`);
  }

  private isZaloEnabledAndConfigured(): boolean {
    const enabled = this.configService.get<boolean>('vietguys.zalo.enabled');
    if (enabled === false) return false;
    return (
      !!this.configService.get<string>('vietguys.zalo.url') &&
      !!this.configService.get<string>('vietguys.zalo.username') &&
      !!this.configService.get<string>('vietguys.zalo.oaId') &&
      !!this.configService.get<string>('vietguys.zalo.templateId')
    );
  }

  private isSmsEnabledAndConfigured(): boolean {
    return (
      !!this.configService.get<string>('vietguys.sms.url') &&
      !!this.configService.get<string>('vietguys.sms.username') &&
      !!this.configService.get<string>('vietguys.sms.pwd') &&
      !!this.configService.get<string>('vietguys.sms.from')
    );
  }

  private isVoiceEnabledAndConfigured(): boolean {
    return (
      this.configService.get<boolean>('vietguys.voice.enabled') === true &&
      !!this.configService.get<string>('vietguys.voice.url')
    );
  }

  private async getAccessToken(): Promise<string> {
    const staticToken =
      this.configService.get<string>('vietguys.token.accessToken') || '';
    if (staticToken) return staticToken;

    const nowSec = Math.floor(Date.now() / 1000);
    if (
      this.cachedAccessToken &&
      this.cachedAccessTokenExpiredAtSec &&
      this.cachedAccessTokenExpiredAtSec - nowSec > 30
    ) {
      return this.cachedAccessToken;
    }

    const refreshToken =
      this.configService.get<string>('vietguys.token.refreshToken') || '';
    const username =
      this.configService.get<string>('vietguys.token.username') ||
      this.configService.get<string>('vietguys.zalo.username') ||
      '';
    const url = this.configService.get<string>('vietguys.token.url') || '';

    if (!refreshToken || !username || !url) {
      throw new Error(
        'Missing VietGuys token config (refreshToken/username/url)',
      );
    }

    const res = await fetch(url, {
      method: 'POST',
      headers: {
        'Refresh-Token': refreshToken,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ username, type: 'refresh_token' }),
    });
    const text = await res.text();
    if (!res.ok) {
      throw new Error(
        `VietGuys token refresh failed ${res.status} ${res.statusText}: ${text}`,
      );
    }

    const json = JSON.parse(text) as any;
    if (json?.error !== 0 || !json?.data?.access_token) {
      throw new Error(`VietGuys token refresh invalid response: ${text}`);
    }

    this.cachedAccessToken = json.data.access_token;
    this.cachedAccessTokenExpiredAtSec =
      typeof json.data.expired_at === 'number' ? json.data.expired_at : null;

    return this.cachedAccessToken!;
  }

  private async sendZaloZns(phone: string, otp: string): Promise<void> {
    if (!this.isZaloEnabledAndConfigured()) {
      throw new Error('Zalo not configured');
    }

    const accessToken = await this.getAccessToken();
    const url = this.configService.get<string>('vietguys.zalo.url')!;
    const username = this.configService.get<string>('vietguys.zalo.username')!;
    const oaId = this.configService.get<string>('vietguys.zalo.oaId')!;
    const templateId = this.configService.get<string>(
      'vietguys.zalo.templateId',
    )!;
    const otpKey =
      this.configService.get<string>('vietguys.zalo.otpKey') || 'otp';

    const extraJson =
      this.configService.get<string>('vietguys.zalo.templateDataExtraJson') ||
      '';
    let extra: Record<string, any> = {};
    if (extraJson) {
      try {
        extra = JSON.parse(extraJson);
      } catch {
        // ignore invalid json
      }
    }

    const payload = {
      username,
      mobile: this.normalizePhone(phone),
      tracking_id: randomUUID(),
      zns: {
        oa_id: oaId,
        template_id: templateId,
        template_data: {
          ...extra,
          [otpKey]: otp,
        },
      },
    };

    const res = await fetch(url, {
      method: 'POST',
      headers: {
        'Access-Token': accessToken,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
    });
    const text = await res.text();
    if (!res.ok) {
      throw new Error(
        `Zalo send failed ${res.status} ${res.statusText}: ${text}`,
      );
    }

    const json = JSON.parse(text) as any;
    if (json?.error !== 0) {
      throw new Error(
        `Zalo send error=${json?.error} message=${json?.message ?? 'unknown'}`,
      );
    }

    this.logger.log(`[VietGuys][ZALO] OTP sent to ${phone}`);
  }

  private async sendVoiceOtp(phone: string, otp: string): Promise<void> {
    if (!this.isVoiceEnabledAndConfigured()) {
      throw new Error('Voice not configured');
    }

    // Placeholder: cần endpoint & payload chính thức từ VietGuys Voice OTP.
    // Hiện tại nếu bật voice mà chưa chỉnh payload cho đúng sẽ throw để tránh "giả thành công".
    throw new Error('Voice OTP not implemented yet');
  }

  private async sendSms(phone: string, otp: string): Promise<void> {
    if (!this.isSmsEnabledAndConfigured()) {
      throw new Error('SMS not configured');
    }

    const apiUrl = this.configService.get<string>('vietguys.sms.url')!;
    const username = this.configService.get<string>('vietguys.sms.username')!;
    const pwd = this.configService.get<string>('vietguys.sms.pwd')!;
    const from = this.configService.get<string>('vietguys.sms.from')!;
    const pid = this.configService.get<string>('vietguys.sms.pid') || '';
    const type = this.configService.get<number>('vietguys.sms.type') ?? 0;

    const normalizedPhone = this.normalizePhone(phone);
    const message = `Ma xac thuc cua ban la: ${otp}. Hieu luc 5 phut.`;

    const form = new FormData();
    form.set('from', from);
    form.set('u', username);
    form.set('pwd', pwd);
    form.set('phone', normalizedPhone);
    form.set('sms', message);
    form.set('bid', randomUUID());
    if (pid) form.set('pid', pid);
    form.set('type', String(type));
    form.set('json', '1');

    const res = await fetch(apiUrl, { method: 'POST', body: form });
    const text = await res.text();
    if (!res.ok) {
      throw new Error(`SMS failed ${res.status} ${res.statusText}: ${text}`);
    }

    const trimmed = text.trim();
    if (/^-\d+$/.test(trimmed)) {
      throw new Error(`SMS errorCode=${trimmed}`);
    }

    let json: any;
    try {
      json = JSON.parse(trimmed);
    } catch {
      throw new Error(`SMS unexpected response: ${trimmed}`);
    }

    const payload = Array.isArray(json) ? json[0] : json;
    if (payload?.error !== 0) {
      throw new Error(
        `SMS error=${payload?.error} log=${payload?.log ?? payload?.message ?? 'unknown'}`,
      );
    }

    this.logger.log(`[VietGuys][SMS] OTP sent to ${phone}`);
  }
}
