import { registerAs } from '@nestjs/config';

export default registerAs(
    'vietguys',
    (): Record<string, any> => ({
        enabled: process.env.VIETGUYS_ENABLED === 'true',
        /**
         * Token (Access-Token) – dùng cho các API dạng v2 (vd: Zalo ZBS).
         * Docs: https://developers.vietguys.biz/#h-ng-d-n-l-y-refresh-token
         */
        token: {
            // Nếu VietGuys cấp sẵn Access-Token tĩnh thì có thể set luôn để bỏ qua refresh flow.
            accessToken: process.env.VIETGUYS_ACCESS_TOKEN || '',
            refreshToken: process.env.VIETGUYS_REFRESH_TOKEN || '',
            username: process.env.VIETGUYS_USERNAME || '',
            url:
                process.env.VIETGUYS_TOKEN_URL ||
                'https://api-v2.vietguys.biz:4438/token/v1/refresh',
        },

        /**
         * Zalo ZBS (ZNS template) – Ưu tiên kênh này để gửi OTP.
         * Docs: https://developers.vietguys.biz/#zalo
         */
        zalo: {
            enabled: process.env.VIETGUYS_ZALO_ENABLED
                ? process.env.VIETGUYS_ZALO_ENABLED === 'true'
                : true,
            url:
                process.env.VIETGUYS_ZALO_URL ||
                'https://api-v2.vietguys.biz:4438/zalo/v4/send',
            username: process.env.VIETGUYS_ZALO_USERNAME || '',
            oaId: process.env.VIETGUYS_ZALO_OA_ID || '',
            templateId: process.env.VIETGUYS_ZALO_TEMPLATE_ID || '',
            // Tên key trong template_data dùng để map OTP (tùy theo template VietGuys/Zalo bạn đăng ký)
            otpKey: process.env.VIETGUYS_ZALO_OTP_KEY || 'otp',
            // Extra template data (JSON string) để bổ sung các field khác (vd: date, customer_name...)
            templateDataExtraJson:
                process.env.VIETGUYS_ZALO_TEMPLATE_DATA_EXTRA_JSON || '',
        },

        /**
         * Voice OTP – VietGuys có sản phẩm Voice OTP nhưng tài liệu endpoint không nằm rõ trong reference hiện tại.
         * Tạm để placeholder: khi VietGuys cung cấp endpoint & payload, chỉ cần cập nhật VietguysService.sendVoiceOtp().
         */
        voice: {
            enabled: process.env.VIETGUYS_VOICE_ENABLED === 'true',
            url: process.env.VIETGUYS_VOICE_URL || '',
        },

        /**
         * SMS Brandname (CSKH) – VietGuys API
         * Docs: https://developers.vietguys.biz/#sms-brandname
         */
        sms: {
            // VietGuys CSKH endpoint (multipart/form-data)
            url:
                process.env.VIETGUYS_SMS_URL ||
                process.env.VIETGUYS_API_URL ||
                'https://cloudsms.vietguys.biz:4438/api/index.php',
            // u
            username: process.env.VIETGUYS_SMS_USERNAME || '',
            // pwd (passcode / access-token field)
            pwd:
                process.env.VIETGUYS_SMS_PWD ||
                process.env.VIETGUYS_API_KEY ||
                '',
            // from (brandname)
            from:
                process.env.VIETGUYS_SMS_FROM ||
                process.env.VIETGUYS_BRANDNAME ||
                'SMARTHOME',
            // pid (optional campaign id)
            pid: process.env.VIETGUYS_SMS_PID || '',
            // 0 = no unicode, 8 = unicode
            type: process.env.VIETGUYS_SMS_TYPE
                ? Number.parseInt(process.env.VIETGUYS_SMS_TYPE, 10)
                : 0,
        },
    })
);
