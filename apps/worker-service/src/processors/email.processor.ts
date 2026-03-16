import { Processor, WorkerHost } from '@nestjs/bullmq'; // Đổi từ @nestjs/bull sang @nestjs/bullmq
import { Job } from 'bullmq';
import { PinoLogger } from 'nestjs-pino';

import { APP_BULLMQ_QUEUES } from '@app/common';
import {
  EmailTemplate,
  ISendEmailParams,
} from '@app/common/helper/interfaces/email.interface';
import { EMAIL_SUBJECTS } from '@app/common/constants/email.constant';
import { HelperEmailService } from '@app/common/helper/services/helper.email.service';

@Processor(APP_BULLMQ_QUEUES.EMAIL)
export class EmailProcessorWorker extends WorkerHost {
  // Kế thừa WorkerHost
  constructor(
    private readonly helperEmailService: HelperEmailService,
    private readonly logger: PinoLogger,
  ) {
    super(); // Bắt buộc gọi super() khi dùng WorkerHost
    this.logger.setContext(EmailProcessorWorker.name);
  }

  // BullMQ dùng một hàm process duy nhất cho mỗi Queue
  async process(job: Job<ISendEmailParams, any, string>): Promise<any> {
    // job.name lúc này tương ứng với cái tên bạn đặt khi mailQueue.add('welcome', data)
    switch (job.name) {
      case EmailTemplate.WELCOME:
        return this.handleWelcomeEmail(job);

      case EmailTemplate.FORGOT_PASSWORD:
        return this.handleForgotPasswordEmail(job);

      default:
        this.logger.warn(`No handler for job name: ${job.name}`);
        return;
    }
  }

  private async handleWelcomeEmail(job: Job<ISendEmailParams>) {
    const { to, context } = job.data;
    this.logger.info(
      { jobId: job.id, recipient: to },
      'Processing welcome email job',
    );

    try {
      await this.helperEmailService.sendEmail({
        to,
        subject: EMAIL_SUBJECTS.WELCOME,
        template: EmailTemplate.WELCOME,
        context,
      });
      this.logger.info({ jobId: job.id }, 'Welcome email sent successfully');
    } catch (error) {
      this.logger.error(
        { jobId: job.id, error: error.message },
        'Failed to send welcome email',
      );
      throw error; // Để BullMQ thực hiện retry theo cấu hình backoff
    }
  }

  private async handleForgotPasswordEmail(job: Job<ISendEmailParams>) {
    const { to, context } = job.data;
    this.logger.info({ jobId: job.id }, 'Processing forgot password email');

    try {
      await this.helperEmailService.sendEmail({
        to,
        subject: EMAIL_SUBJECTS.FORGOT_PASSWORD,
        template: EmailTemplate.FORGOT_PASSWORD,
        context,
      });
      this.logger.info(
        { jobId: job.id },
        'Forgot password email sent successfully',
      );
    } catch (error) {
      this.logger.error(
        { jobId: job.id, error: error.message },
        'Failed to send forgot pass',
      );
      throw error;
    }
  }
}
