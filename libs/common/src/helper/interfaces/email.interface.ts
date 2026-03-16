// 1. Định nghĩa danh sách các template (tương ứng với tên file .hbs)
export enum EmailTemplate {
    WELCOME = 'welcome', // file: welcome.hbs
    FORGOT_PASSWORD = 'forgot-password', // file: forgot-password.hbs
    DEVICE_ALERT = 'device-alert', // file: device-alert.hbs
}

// 2. Interface cho hàm gửi mail
export interface ISendEmailParams {
    to: string | string[]; // Nodemailer dùng 'to', có thể là 1 string hoặc mảng string
    subject: string; // Tiêu đề email (cần truyền vào vì không còn lưu trên AWS)
    template: EmailTemplate; // Tên template (thay cho emailType)
    context: Record<string, any>; // Dữ liệu động để điền vào template (Thay cho payload)
}

// 3. (Optional) Interface payload cụ thể cho từng loại mail
// Giúp code gợi ý (Intellisense) tốt hơn
export interface IWelcomeEmailContext {
    userName: string;
    loginUrl?: string;
}

export interface IForgotPasswordContext {
    userName: string;
    resetUrl: string;
}
