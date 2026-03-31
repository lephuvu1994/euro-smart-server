import { Injectable, Logger } from '@nestjs/common';
import Expo, { ExpoPushMessage, ExpoPushTicket } from 'expo-server-sdk';
import { DatabaseService } from '@app/database';

@Injectable()
export class NotificationService {
  private readonly logger = new Logger(NotificationService.name);
  private expo: Expo;

  constructor(private readonly db: DatabaseService) {
    this.expo = new Expo({ accessToken: process.env.EXPO_ACCESS_TOKEN });
  }

  /**
   * Helper function to build push messages.
   * Handles chunking and sending to Expo.
   */
  async sendPushMessages(messages: ExpoPushMessage[]): Promise<void> {
    const validMessages: ExpoPushMessage[] = [];

    // Filter out invalid tokens just in case
    for (const message of messages) {
      if (!Expo.isExpoPushToken(message.to as string)) {
        this.logger.error(`Push token ${message.to} is not a valid Expo push token`);
        // TODO: In a production app, we should probably delete this invalid token from the DB.
        continue;
      }
      validMessages.push(message);
    }

    if (validMessages.length === 0) return;

    // chunkPushNotifications optimizes the payloads to minimize requests
    const chunks = this.expo.chunkPushNotifications(validMessages);
    const tickets: ExpoPushTicket[] = [];

    for (const chunk of chunks) {
      try {
        const ticketChunk = await this.expo.sendPushNotificationsAsync(chunk);
        tickets.push(...ticketChunk);
        // We can inspect tickets for 'DeviceNotRegistered' errors to clean up DB
        // But for now, we just log them
      } catch (error) {
        this.logger.error('Error sending push notifications chunk', error);
      }
    }
  }

  /**
   * Send a notification to specific user devices
   */
  async sendToUser(userId: string, title: string, body: string, data?: Record<string, unknown>) {
    const sessions = await this.db.session.findMany({
      where: { userId, pushToken: { not: null } },
      select: { pushToken: true },
    });

    if (sessions.length === 0) {
      return;
    }

    const messages: ExpoPushMessage[] = sessions.map((s) => ({
      to: s.pushToken as string,
      title,
      body,
      data,
    }));

    await this.sendPushMessages(messages);
  }

  /**
   * Send a notification to all members of a home
   */
  async sendToHome(homeId: string, title: string, body: string, data?: Record<string, unknown>) {
    const homeMembers = await this.db.homeMember.findMany({
      where: { homeId },
      include: {
        user: {
          include: {
            sessions: {
              where: { pushToken: { not: null } },
              select: { pushToken: true },
            },
          },
        },
      },
    });

    const pushTokens = homeMembers.flatMap((member) =>
      member.user.sessions.map((s) => s.pushToken).filter(Boolean),
    );

    // Deduplicate tokens
    const uniqueTokens = [...new Set(pushTokens)];

    if (uniqueTokens.length === 0) return;

    const messages: ExpoPushMessage[] = uniqueTokens.map((token) => ({
      to: token as string,
      title,
      body,
      data,
    }));

    await this.sendPushMessages(messages);
  }

  /**
   * Advanced Contextual Sending (Tuya-style constraint checking)
   * Sends to all related users (owner + home members + shared) except excludeUserIds
   */
  async sendDeviceAlert(
    deviceId: string,
    eventType: 'offline' | 'open' | string,
    title: string,
    body: string,
    data?: Record<string, unknown>,
  ) {
    const device = await this.db.device.findUnique({
      where: { id: deviceId },
      select: {
        customConfig: true,
        ownerId: true,
        homeId: true,
        sharedUsers: { select: { userId: true } },
      },
    });

    if (!device) return;

    // Verify rules
    const config = (device.customConfig as { notify?: Record<string, boolean> }) || {};
    const isNotifyEnabled = config.notify?.[eventType] === true;

    if (!isNotifyEnabled) {
      // Notification for this event is disabled by user on device level
      return;
    }

    // ★ Collect all target user IDs (owner + shared + home members)
    const targetUserIds = new Set<string>();
    targetUserIds.add(device.ownerId);

    for (const share of device.sharedUsers) {
      targetUserIds.add(share.userId);
    }

    if (device.homeId) {
      const members = await this.db.homeMember.findMany({
        where: { homeId: device.homeId },
        select: { userId: true },
      });
      for (const m of members) {
        targetUserIds.add(m.userId);
      }
    }

    // ★ Exclude the user(s) who initiated the action
    const excludeUserIds = data?.excludeUserIds as string[] | undefined;
    if (excludeUserIds) {
      for (const uid of excludeUserIds) {
        targetUserIds.delete(uid);
      }
    }

    if (targetUserIds.size === 0) return;

    // Fetch all push tokens for remaining users
    const sessions = await this.db.session.findMany({
      where: {
        userId: { in: [...targetUserIds] },
        pushToken: { not: null },
      },
      select: { pushToken: true },
    });

    if (sessions.length === 0) return;

    // Strip internal fields from data before sending to client
    const { excludeUserIds: _, ...cleanData } = data ?? {};

    const messages = sessions.map((s) => ({
      to: s.pushToken as string,
      title,
      body,
      data: { ...cleanData, deviceId, link: `/devices/${deviceId}` },
    }));

    await this.sendPushMessages(messages);
  }
}
