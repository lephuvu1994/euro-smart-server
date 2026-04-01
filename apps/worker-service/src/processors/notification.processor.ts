import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Injectable, Logger } from '@nestjs/common';
import { Job } from 'bullmq';
import { APP_BULLMQ_QUEUES } from '@app/common/enums/app.enum';
import { NotificationService } from '@app/common/notification/services/notification.service';
import { MessageService } from '@app/common/message/services/message.service';

export interface PushNotificationJobData {
  type: 'user' | 'home' | 'deviceAlert';
  payload: {
    userId?: string;
    homeId?: string;
    deviceId?: string;
    eventType?: string;
    title?: string;
    body?: string;
    titleKey?: string;
    bodyKey?: string;
    data?: Record<string, unknown>;
  };
}

@Processor(APP_BULLMQ_QUEUES.PUSH_NOTIFICATION)
@Injectable()
export class NotificationProcessor extends WorkerHost {
  private readonly logger = new Logger(NotificationProcessor.name);

  constructor(
    private readonly notificationService: NotificationService,
    private readonly messageService: MessageService,
  ) {
    super();
  }

  async process(job: Job<PushNotificationJobData>): Promise<void> {
    const { type, payload } = job.data;

    try {
      this.logger.debug(
        `Processing notification job ${job.id} of type ${type}`,
      );

      // Resolve title and body (translate if keys are provided, otherwise use raw strings as keys)
      // Defaulting to 'vi' if language is not set anywhere
      const lang = 'vi';
      const args = payload.data || {};

      const translatedTitle = this.messageService.translate(
        payload.titleKey || payload.title || '',
        {
          lang,
          args,
        },
      );
      const translatedBody = this.messageService.translate(
        payload.bodyKey || payload.body || '',
        {
          lang,
          args,
        },
      );

      this.logger.debug(`Resolved Title: ${translatedTitle}`);
      this.logger.debug(`Resolved Body: ${translatedBody}`);

      if (!translatedTitle || !translatedBody) {
        this.logger.warn(
          `Push notification job ${job.id} resolved to empty title or body. Skipping.`,
        );
        return;
      }

      // Nếu kết quả dịch vẫn y hệt titleKey thì có thể là dịch thất bại (nestjs-i18n trả về key nếu không tìm thấy)
      if (translatedTitle === payload.titleKey) {
        this.logger.warn(
          `Translation failed for titleKey: ${payload.titleKey}. Using raw key as fallback.`,
        );
      }

      switch (type) {
        case 'user':
          if (!payload.userId) {
            throw new Error('UserId is missing for user notification');
          }
          await this.notificationService.sendToUser(
            payload.userId,
            translatedTitle,
            translatedBody,
            args,
          );
          break;

        case 'home':
          if (!payload.homeId) {
            throw new Error('HomeId is missing for home notification');
          }
          await this.notificationService.sendToHome(
            payload.homeId,
            translatedTitle,
            translatedBody,
            args,
          );
          break;

        case 'deviceAlert':
          if (!payload.deviceId || !payload.eventType) {
            throw new Error(
              'DeviceId or eventType is missing for deviceAlert notification',
            );
          }
          await this.notificationService.sendDeviceAlert(
            payload.deviceId,
            payload.eventType,
            translatedTitle,
            translatedBody,
            args,
          );
          break;

        default:
          this.logger.warn(`Unknown notification job type: ${type}`);
      }

      this.logger.log(`Successfully processed notification job ${job.id}`);
    } catch (error) {
      this.logger.error(
        `Failed to process notification job ${job.id}`,
        error instanceof Error ? error.stack : error,
      );
      throw error; // Let BullMQ retry
    }
  }
}
