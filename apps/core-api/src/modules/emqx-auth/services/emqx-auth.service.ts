import { Injectable, Logger } from '@nestjs/common';
import { DatabaseService } from '@app/database';
import { RedisService } from '@app/redis-cache';
import * as crypto from 'crypto';
import { EmqxAuthDto } from '../dto/emqx-auth.dto';
import { EmqxAclDto } from '../dto/emqx-acl.dto';

/** TTL for cached systemConfig values (seconds) */
const CFG_TTL = 300;

@Injectable()
export class EmqxAuthService {
  private readonly logger = new Logger(EmqxAuthService.name);

  constructor(
    private readonly db: DatabaseService,
    private readonly redis: RedisService,
  ) {}

  // ═══════════════════════════════════════════
  // AUTH: Verify credentials
  // ═══════════════════════════════════════════
  async authenticate(dto: EmqxAuthDto): Promise<{ result: 'allow' | 'deny' }> {
    const globalUser = process.env.MQTT_USER?.trim();
    const globalPass = process.env.MQTT_PASS?.trim();
    console.error('RECEIVED_AUTH dto:', JSON.stringify(dto), 'ENV user:', JSON.stringify(globalUser));
    if (!dto.username) {
      return { result: 'deny' };
    }

    // Case 1: Server services (iot-gateway, worker-service) — global superuser
    if (dto.username?.trim() === globalUser) {
      return { result: 'allow' };
    }

    // Case 2: App user — username format "user_{userId}"
    if (dto.username.startsWith('user_')) {
      const userId = dto.username.replace('user_', '');
      const timestamp = this.extractTimestampFromClientId(dto.clientid);
      if (!timestamp) {
        this.logger.warn(`Auth denied: malformed clientid="${dto.clientid}"`);
        return { result: 'deny' };
      }

      const expected = crypto
        .createHmac('sha256', process.env.APP_MQTT_SECRET)
        .update(`${userId}:${timestamp}`)
        .digest('hex');

      return { result: expected === dto.password ? 'allow' : 'deny' };
    }

    // Case 3: Embedded device — username format "device_{token}"
    if (dto.username.startsWith('device_')) {
      const token = dto.username.replace('device_', '');
      // Password must equal the token itself
      if (dto.password !== token) {
        this.logger.warn(`Auth denied: bad password for device token`);
        return { result: 'deny' };
      }
      // Verify the token exists in the Device table
      const device = await this.db.device.findUnique({
        where: { token },
        select: { id: true },
      });
      return { result: device ? 'allow' : 'deny' };
    }

    this.logger.warn(`Auth denied: unknown username format="${dto.username}"`);
    return { result: 'deny' };
  }

  // ═══════════════════════════════════════════
  // ACL: Ownership + Shared check
  // ═══════════════════════════════════════════
  async authorize(dto: EmqxAclDto): Promise<{ result: 'allow' | 'deny' }> {
    // Server services → allow all
    const globalUser = process.env.MQTT_USER?.trim();
    console.error('RECEIVED_ACL dto:', JSON.stringify(dto), 'ENV user:', JSON.stringify(globalUser));
    if (dto.username?.trim() === globalUser) {
      return { result: 'allow' };
    }

    if (!dto.username || !dto.topic || !dto.action) {
      return { result: 'deny' };
    }

    // Embedded device — username format "device_{token}"
    // Devices can publish AND subscribe, but ONLY to their own topics:
    //   device/{token}/status  (publish)
    //   device/{token}/set     (subscribe)
    //   device/{token}/license (subscribe)
    if (dto.username.startsWith('device_')) {
      const token = dto.username.replace('device_', '');
      const topicToken = this.extractTokenFromTopic(dto.topic);
      return { result: topicToken === token ? 'allow' : 'deny' };
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
      this.logger.warn(
        `ACL denied: cannot extract token from topic="${dto.topic}"`,
      );
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
  // CREDENTIALS: Generate for app user (WSS)
  // ═══════════════════════════════════════════
  async generateCredentials(userId: string): Promise<{
    url: string;
    username: string;
    password: string;
    clientId: string;
  }> {
    // Fetch WSS URL from Admin DB config (fallback to ENV)
    const url = await this.getCachedConfig('MQTT_WSS_URL') ?? process.env.MQTT_WSS_URL ?? '';

    const timestamp = Date.now().toString();
    const password = crypto
      .createHmac('sha256', process.env.APP_MQTT_SECRET)
      .update(`${userId}:${timestamp}`)
      .digest('hex');

    return {
      url,
      username: `user_${userId}`,
      password,
      clientId: `app_${userId}_${timestamp}`,
    };
  }

  // ─── Helpers ───────────────────────────────

  /**
   * Fetch a systemConfig value from Redis cache (TTL 5min), fallback to DB.
   * This eliminates repeated DB hits for static configs on every MQTT event.
   */
  private async getCachedConfig(key: string): Promise<string | null> {
    const cacheKey = `emqx:cfg:${key}`;
    const cached = await this.redis.get(cacheKey);
    if (cached !== null) return cached;

    const row = await this.db.systemConfig.findUnique({ where: { key } });
    const value = row?.value ?? null;
    if (value !== null) {
      await this.redis.set(cacheKey, value, CFG_TTL);
    }
    return value;
  }

  private extractTokenFromTopic(topic: string): string | null {
    // Topic format: "device/{token}/action"
    const parts = topic.split('/');
    if (parts.length < 3 || parts[0] !== 'device') return null;
    return parts[1] || null;
  }

  private extractTimestampFromClientId(clientId: string): string | null {
    // ClientId format: "app_{userId}_{timestamp}"
    const parts = clientId.split('_');
    if (parts.length < 3) return null;
    return parts[parts.length - 1] || null;
  }
}
