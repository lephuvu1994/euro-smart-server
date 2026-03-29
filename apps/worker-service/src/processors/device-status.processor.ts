import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Job } from 'bullmq';
import { Logger } from '@nestjs/common';
import { APP_BULLMQ_QUEUES, DEVICE_JOBS } from '@app/common';
import { DatabaseService } from '@app/database';

@Processor(APP_BULLMQ_QUEUES.DEVICE_STATUS)
export class DeviceStatusProcessor extends WorkerHost {
  private readonly logger = new Logger(DeviceStatusProcessor.name);

  constructor(private readonly db: DatabaseService) {
    super();
  }

  async process(job: Job): Promise<any> {
    switch (job.name) {
      case DEVICE_JOBS.UPDATE_LAST_SEEN:
        return this.handleUpdateLastSeen(job);

      case DEVICE_JOBS.RECORD_STATE_HISTORY:
        return this.handleRecordStateHistory(job);

      case DEVICE_JOBS.RECORD_CONNECTION_LOG:
        return this.handleRecordConnectionLog(job);

      default:
        this.logger.warn(`[DeviceStatus] Unknown job: ${job.name}`);
    }
  }

  private async handleUpdateLastSeen(job: Job): Promise<void> {
    const { token } = job.data as { token: string };
    if (!token) return;
    this.logger.log(`[UPDATE_LAST_SEEN] Device ${token} heartbeat acknowledged`);
  }

  /**
   * Ghi lịch sử thay đổi trạng thái entity (OPEN/CLOSE/ON/OFF...)
   */
  private async handleRecordStateHistory(job: Job): Promise<void> {
    const { entityId, value, valueText, source } = job.data as {
      entityId: string;
      value: number | null;
      valueText: string | null;
      source: string;
    };

    if (!entityId) return;

    try {
      await this.db.entityStateHistory.create({
        data: { entityId, value, valueText, source },
      });
      this.logger.log(
        `[STATE_HISTORY] entity=${entityId} value=${value ?? valueText} source=${source}`,
      );
    } catch (error) {
      this.logger.error(
        `[STATE_HISTORY] Failed to record: ${error.message}`,
      );
    }
  }

  /**
   * Ghi lịch sử kết nối thiết bị (online/offline)
   */
  private async handleRecordConnectionLog(job: Job): Promise<void> {
    const { token, event } = job.data as {
      token: string;
      event: string; // "online" | "offline"
    };

    if (!token || !event) return;

    try {
      // Tìm device by token để lấy deviceId
      const device = await this.db.device.findUnique({
        where: { token },
        select: { id: true },
      });

      if (!device) {
        this.logger.warn(`[CONNECTION_LOG] Device not found: ${token}`);
        return;
      }

      await this.db.deviceConnectionLog.create({
        data: { deviceId: device.id, event },
      });
      this.logger.log(
        `[CONNECTION_LOG] device=${token} event=${event}`,
      );
    } catch (error) {
      this.logger.error(
        `[CONNECTION_LOG] Failed to record: ${error.message}`,
      );
    }
  }
}
