import { Injectable, Logger } from '@nestjs/common';
import { RedisService } from '@app/redis-cache';
import { Queue } from 'bullmq';
import { InjectQueue } from '@nestjs/bullmq';
import {
  APP_BULLMQ_QUEUES,
  EDeviceAlertEvent,
  EDeviceConnectionStatus,
} from '@app/common/enums/app.enum';
import { DEVICE_JOBS } from '@app/common/enums/device-job.enum';
import { DatabaseService } from '@app/database';
import { MqttService } from '@app/common/mqtt/mqtt.service';
import { DeviceStateService } from './device-state.service';

@Injectable()
export class DeviceStatusService {
  private readonly logger = new Logger(DeviceStatusService.name);

  constructor(
    private readonly databaseService: DatabaseService,
    private redisService: RedisService,
    private mqttService: MqttService,
    private deviceStateService: DeviceStateService,
    @InjectQueue(APP_BULLMQ_QUEUES.DEVICE_STATUS)
    private statusQueue: Queue,
    @InjectQueue(APP_BULLMQ_QUEUES.DEVICE_CONTROL)
    private deviceControlQueue: Queue,
    @InjectQueue(APP_BULLMQ_QUEUES.PUSH_NOTIFICATION)
    private notificationQueue: Queue,
  ) {}

  public async processStatus(
    deviceToken: string,
    rawData: Record<string, any>,
  ) {
    try {
      // ★ UNBIND CHECK — detect soft-deleted devices before processing status
      const unboundDevice = await this.databaseService.device.findFirst({
        where: { token: deviceToken, unboundAt: { not: null } },
        select: {
          id: true,
          token: true,
          partner: { select: { code: true } },
          deviceModel: { select: { code: true } },
        },
      });

      if (unboundDevice) {
        this.logger.warn(
          `[UNBIND] Device ${deviceToken} is unbound. Sending unbind command...`,
        );

        const cmdTopic = `${unboundDevice.partner.code}/${unboundDevice.deviceModel.code}/${deviceToken}/set`;

        // ★ PARALLEL: publish + hard-delete are independent
        await Promise.all([
          this.mqttService.publish(
            cmdTopic,
            JSON.stringify({ action: 'unbind' }),
            { qos: 1 },
          ),
          this.deviceControlQueue.add(
            DEVICE_JOBS.HARD_DELETE_DEVICE,
            { deviceId: unboundDevice.id, token: deviceToken },
            { priority: 1, attempts: 2, removeOnComplete: true },
          ),
        ]);

        return; // Stop processing — device is being unbound
      }

      // Serialize nested objects for Redis hmset
      const shadowData: Record<string, string | number | boolean> = {};
      for (const [key, value] of Object.entries(rawData)) {
        if (typeof value === 'object' && value !== null) {
          shadowData[key] = JSON.stringify(value);
        } else {
          shadowData[key] = value as string | number | boolean;
        }
      }

      // ★ SEQUENTIAL: must read previousStatus BEFORE writing new status
      const previousStatus = await this.redisService.get(
        `status:${deviceToken}`,
      );
      const newEvent =
        rawData.online === false
          ? EDeviceConnectionStatus.OFFLINE
          : EDeviceConnectionStatus.ONLINE;

      // ★ PARALLEL: all remaining operations are independent of each other
      const parallel: Promise<unknown>[] = [];

      // 1. Write new status to Redis
      if (rawData.online === false) {
        parallel.push(this.redisService.del(`status:${deviceToken}`));
      } else {
        parallel.push(this.redisService.set(`status:${deviceToken}`, 'online'));
      }

      // 2. Write shadow
      parallel.push(
        this.redisService.hmset(`device:shadow:${deviceToken}`, shadowData),
      );

      // 3. Queue lastSeen DB update (debounced in worker)
      parallel.push(
        this.statusQueue.add(DEVICE_JOBS.UPDATE_LAST_SEEN, {
          token: deviceToken,
          rawData,
        }),
      );

      // 4. Connection log + Push notification (only when status actually changed)
      const wasOnline = previousStatus === 'online';
      const isNowOnline = newEvent === EDeviceConnectionStatus.ONLINE;
      if (wasOnline !== isNowOnline) {
        // ★ Anti-duplicate lock: chỉ 1 worker được gửi noti trong 5s
        // Tránh race condition khi chip gửi 2+ bản tin gần nhau
        const lockKey = `status_transition_lock:${deviceToken}`;
        const acquired = await this.redisService.setnxWithTtl(
          lockKey,
          newEvent,
          5000, // 5s TTL
        );

        if (acquired) {
          // Connection log — independent
          parallel.push(
            this.statusQueue.add(
              DEVICE_JOBS.RECORD_CONNECTION_LOG,
              { token: deviceToken, event: newEvent },
              { removeOnComplete: true, attempts: 2 },
            ),
          );

          // Device lookup → notification dispatch (chained, but parallel to everything else)
          parallel.push(
            this.databaseService.device
              .findUnique({
                where: { token: deviceToken },
                select: {
                  id: true,
                  name: true,
                  ownerId: true,
                  homeId: true,
                  sharedUsers: { select: { userId: true } },
                  home: { select: { members: { select: { userId: true } } } },
                },
              })
              .then(async (device) => {
                if (!device) return;

                // Pre-flight check: ensure at least one target user has a pushToken
                const targetUserIds = new Set<string>();
                targetUserIds.add(device.ownerId);
                if (device.sharedUsers) {
                  device.sharedUsers.forEach((s) =>
                    targetUserIds.add(s.userId),
                  );
                }
                if (device.home?.members) {
                  device.home.members.forEach((m) =>
                    targetUserIds.add(m.userId),
                  );
                }

                if (targetUserIds.size > 0) {
                  const activeSession =
                    await this.databaseService.session.findFirst({
                      where: {
                        userId: { in: Array.from(targetUserIds) },
                        pushToken: { not: null },
                      },
                      select: { id: true },
                    });
                  if (!activeSession) return; // Skip pushing to Redis if no one has a token
                }

                const jobName =
                  newEvent === EDeviceConnectionStatus.OFFLINE
                    ? 'push_offline_alert'
                    : 'push_online_alert';
                const alertEvent =
                  newEvent === EDeviceConnectionStatus.OFFLINE
                    ? EDeviceAlertEvent.OFFLINE
                    : EDeviceAlertEvent.ONLINE;
                const titleKey = `device.alert.${newEvent}.title`;
                const bodyKey = `device.alert.${newEvent}.body`;
                return this.notificationQueue.add(
                  jobName,
                  {
                    type: 'deviceAlert',
                    payload: {
                      deviceId: device.id,
                      eventType: alertEvent,
                      titleKey,
                      bodyKey,
                      data: { deviceName: device.name },
                    },
                  },
                  { removeOnComplete: true, attempts: 1 },
                );
              }),
          );
        } else {
          this.logger.debug(
            `[STATUS] Skipped duplicate transition notification for ${deviceToken} (lock held)`,
          );
        }
      }

      // 5. Process state history (firmware may bundle telemetry in status message)
      parallel.push(this.deviceStateService.processState(deviceToken, rawData));

      this.logger.log(
        `Device ${deviceToken} status updated: ${JSON.stringify(rawData)}`,
      );

      await Promise.all(parallel);
    } catch (error) {
      this.logger.error(`Failed to handle status message: ${error.message}`);
    }
  }
}
