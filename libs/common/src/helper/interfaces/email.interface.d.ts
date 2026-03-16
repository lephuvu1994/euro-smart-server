export declare enum EmailTemplate {
  WELCOME = 'welcome',
  FORGOT_PASSWORD = 'forgot-password',
  DEVICE_ALERT = 'device-alert',
}
export interface ISendEmailParams {
  to: string | string[];
  subject: string;
  template: EmailTemplate;
  context: Record<string, any>;
}
export interface IWelcomeEmailContext {
  userName: string;
  loginUrl?: string;
}
export interface IForgotPasswordContext {
  userName: string;
  resetUrl: string;
}
