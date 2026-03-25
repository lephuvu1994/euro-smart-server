import { Injectable, Logger } from '@nestjs/common';
import { DatabaseService } from '@app/database';
import * as crypto from 'crypto';
import { EmqxAuthDto } from '../dto/emqx-auth.dto';
import { EmqxAclDto } from '../dto/emqx-acl.dto';

@Injectable()
export class EmqxAuthService {
  private readonly logger = new Logger(EmqxAuthService.name);

  constructor(private readonly db: DatabaseService) {}

  // ═══════════════════════════════════════════
  // AUTH: HMAC verification (stateless, 0 I/O)
  // ═══════════════════════════════════════════
  authenticate(dto: EmqxAuthDto): { result: 'allow' | 'deny' } {
    // Case 1: Server services (iot-gateway, worker-service)
    if (dto.username === process.env.MQTT_USER) {
      return {
        result: dto.password === process.env.MQTT_PASS ? 'allow' : 'deny',
      };
    }

    // Case 2: App user — username format "user_{userId}"
    if (dto.username.startsWith('user_')) {
      const userId = dto.username.replace('user_', '');
      const timestamp = this.extractTimestampFromClientId(dto.clientid);
      if (!timestamp) {
        this.logger.warn(
          `Auth denied: malformed clientid="${dto.clientid}"`,
        );
        return { result: 'deny' };
      }

      const expected = crypto
        .createHmac('sha256', process.env.APP_MQTT_SECRET)
        .update(`${userId}:${timestamp}`)
        .digest('hex');

      return { result: expected === dto.password ? 'allow' : 'deny' };
    }

    this.logger.warn(`Auth denied: unknown username format="${dto.username}"`);
    return { result: 'deny' };
  }

  // ═══════════════════════════════════════════
  // ACL: Ownership + Shared check
  // ═══════════════════════════════════════════
  async authorize(
    dto: EmqxAclDto,
  ): Promise<{ result: 'allow' | 'deny' }> {
    // Server services → allow all
    if (dto.username === process.env.MQTT_USER) {
      return { result: 'allow' };
    }

    // App user
    if (!dto.username.startsWith('user_')) {
      return { result: 'deny' };
    }

    // App user → deny publish (chỉ server mới publish command)
    if (dto.action === 'publish') {
      return { result: 'deny' };
    }

    // Extract device token from topic: "COMPANY/MODEL/{token}/state"
    const token = this.extractTokenFromTopic(dto.topic);
    if (!token) {
      this.logger.warn(`ACL denied: cannot extract token from topic="${dto.topic}"`);
      return { result: 'deny' };
    }

    const userId = dto.username.replace('user_', '');

    try {
      // Check device exists
      const device = await this.db.device.findUnique({
        where: { token },
        select: { id: true, ownerId: true },
      });

      if (!device) {
        return { result: 'deny' };
      }

      // Check ownership
      if (device.ownerId === userId) {
        return { result: 'allow' };
      }

      // Check shared
      const shared = await this.db.deviceShare.findFirst({
        where: { deviceId: device.id, userId },
      });

      return { result: shared ? 'allow' : 'deny' };
    } catch (error) {
      this.logger.error(`ACL check failed: ${error.message}`);
      return { result: 'deny' };
    }
  }

  // ═══════════════════════════════════════════
  // CREDENTIALS: Generate for app user (0 DB query)
  // ═══════════════════════════════════════════
  generateCredentials(userId: string): {
    url: string;
    username: string;
    password: string;
    clientId: string;
  } {
    const timestamp = Date.now().toString();
    const password = crypto
      .createHmac('sha256', process.env.APP_MQTT_SECRET)
      .update(`${userId}:${timestamp}`)
      .digest('hex');

    return {
      url: process.env.MQTT_WSS_URL,
      username: `user_${userId}`,
      password,
      clientId: `app_${userId}_${timestamp}`,
    };
  }

  // ─── Helpers ───────────────────────────────
  private extractTokenFromTopic(topic: string): string | null {
    // Topic format: "COMPANY/MODEL/{token}/state" or "+/+/{token}/state"
    const parts = topic.split('/');
    if (parts.length < 3) return null;
    return parts[2] || null;
  }

  private extractTimestampFromClientId(clientId: string): string | null {
    // ClientId format: "app_{userId}_{timestamp}"
    const parts = clientId.split('_');
    if (parts.length < 3) return null;
    return parts[parts.length - 1] || null;
  }
}
