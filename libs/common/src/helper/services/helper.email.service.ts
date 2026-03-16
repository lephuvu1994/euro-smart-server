import { Injectable, Logger } from '@nestjs/common';
import { MailerService } from '@nestjs-modules/mailer';

@Injectable()
export class HelperEmailService {
    private readonly logger = new Logger(HelperEmailService.name);

    constructor(private readonly mailerService: MailerService) {}

    // Hàm gửi email chung
    async sendEmail(payload: {
        to: string | string[];
        subject: string;
        template: string;
        context: any;
    }): Promise<void> {
        try {
            await this.mailerService.sendMail({
                to: payload.to,
                subject: payload.subject,
                template: `./${payload.template}`,
                context: payload.context,
            });
            this.logger.log(`Email sent to ${payload.to} successfully`);
        } catch (error) {
            this.logger.error(
                `Failed to send email to ${payload.to}`,
                error.stack
            );
            // QUAN TRỌNG: Phải ném lỗi ra để Worker bắt được và Queue biết để retry
            throw error;
        }
    }

    // Ví dụ hàm gửi cụ thể: Quên mật khẩu
    async sendForgotPassword(email: string, name: string, token: string) {
        const url = `https://your-app.com/reset-password?token=${token}`;

        return this.sendEmail({
            to: email,
            subject: 'Khôi phục mật khẩu Smart Home',
            template: 'forgot-password',
            context: {
                name: name,
                url: url,
            },
        });
    }
}
