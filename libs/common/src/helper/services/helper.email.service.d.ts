import { MailerService } from '@nestjs-modules/mailer';
export declare class HelperEmailService {
  private readonly mailerService;
  private readonly logger;
  constructor(mailerService: MailerService);
  sendEmail(payload: {
    to: string | string[];
    subject: string;
    template: string;
    context: any;
  }): Promise<void>;
  sendForgotPassword(email: string, name: string, token: string): Promise<void>;
}
