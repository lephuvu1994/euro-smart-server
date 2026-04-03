import { Inject, Injectable, OnModuleDestroy } from '@nestjs/common';
import Redis from 'ioredis';

@Injectable()
export class RedisService implements OnModuleDestroy {
  constructor(@Inject('REDIS_CLIENT') private readonly redisClient: Redis) {}

  onModuleDestroy() {
    this.redisClient.disconnect();
  }

  getClient(): Redis {
    return this.redisClient;
  }

  // --- BASIC STRING (Dùng cho Status Online/Offline) ---

  async get(key: string): Promise<string | null> {
    return await this.redisClient.get(key);
  }

  async set(
    key: string,
    value: string | number,
    ttl?: number,
  ): Promise<string> {
    const finalValue = String(value);
    if (ttl) {
      return await this.redisClient.set(key, finalValue, 'EX', ttl);
    }
    return await this.redisClient.set(key, finalValue);
  }

  /**
   * Acquire a distributed lock with TTL
   */
  async setnxWithTtl(
    key: string,
    value: string,
    ttlMs: number,
  ): Promise<boolean> {
    const result = await this.redisClient.set(key, value, 'PX', ttlMs, 'NX');
    return result === 'OK';
  }

  // --- HASH (Dùng cho Device Shadow / Telemetry) ---

  /**
   * [UPDATE] Lưu một Object nhiều trường vào Redis Hash
   * Ví dụ: hmset('shadow:token', { temp: 25, hum: 60, status: 'ON' })
   */
  async hmset(key: string, data: Record<string, any>): Promise<number> {
    // Redis không lưu được Nested Object, ta cần convert value sang string
    const processedData: Record<string, string | number> = {};

    for (const [field, value] of Object.entries(data)) {
      // Nếu value là object (VD: màu sắc {r,g,b}), stringify nó
      if (typeof value === 'object' && value !== null) {
        processedData[field] = JSON.stringify(value);
      } else {
        // Giữ nguyên số hoặc string
        processedData[field] = value as string | number;
      }
    }

    // ioredis hỗ trợ truyền object vào hset (tương đương hmset cũ)
    return await this.redisClient.hset(key, processedData);
  }
  /**
   * Lưu dữ liệu vào Hash.
   * Hỗ trợ cả (key, field, value) và (key, object)
   */
  async hset(
    key: string,
    fieldOrObject: string | Record<string, any>,
    value?: any,
  ): Promise<number> {
    // Trường hợp 1: Truyền vào một Object (rawData từ MQTT)
    if (typeof fieldOrObject === 'object') {
      const pipeline: Record<string, string> = {};
      for (const [k, v] of Object.entries(fieldOrObject)) {
        pipeline[k] = typeof v === 'object' ? JSON.stringify(v) : String(v);
      }
      return await this.redisClient.hset(key, pipeline);
    }

    // Trường hợp 2: Truyền lẻ field và value
    const finalValue =
      typeof value === 'object' ? JSON.stringify(value) : String(value);
    return await this.redisClient.hset(key, fieldOrObject, finalValue);
  }

  async hget(key: string, field: string): Promise<string | null> {
    return await this.redisClient.hget(key, field);
  }

  /**
   * [UPDATE] Lấy toàn bộ Hash về
   */
  async hgetall(key: string): Promise<Record<string, string>> {
    return await this.redisClient.hgetall(key);
  }

  // --- UTILS ---

  async del(key: string | string[]): Promise<number> {
    if (Array.isArray(key)) {
      if (key.length === 0) return 0;
      return await this.redisClient.del(...key);
    }
    return await this.redisClient.del(key);
  }

  // --- SET (Dùng cho Feature Key Tracking) ---

  /**
   * Thêm member(s) vào Redis Set
   * Ví dụ: sadd('device:abc:_fkeys', 'device:abc:feature:sw1')
   */
  async sadd(key: string, ...members: string[]): Promise<number> {
    return await this.redisClient.sadd(key, ...members);
  }

  /**
   * Lấy toàn bộ member trong Redis Set
   * Ví dụ: smembers('device:abc:_fkeys') → ['device:abc:feature:sw1', ...]
   */
  async smembers(key: string): Promise<string[]> {
    return await this.redisClient.smembers(key);
  }

  /**
   * Xóa member(s) khỏi Redis Set
   */
  async srem(key: string, ...members: string[]): Promise<number> {
    return await this.redisClient.srem(key, ...members);
  }

  /**
   * @deprecated Dùng smembers() thay thế. KEYS là O(N) block Redis khi có 100k+ keys.
   * Tìm tất cả keys theo pattern (dùng wildcard *)
   * Ví dụ: keys('device:abc:*') → ['device:abc:f1', 'device:abc:f2']
   */
  async keys(pattern: string): Promise<string[]> {
    return await this.redisClient.keys(pattern);
  }

  /**
   * Set thời gian hết hạn cho Key (nếu cần)
   */
  async expire(key: string, seconds: number): Promise<number> {
    return await this.redisClient.expire(key, seconds);
  }

  // --- PUB/SUB (Dùng cho cross-app communication) ---

  /**
   * Publish message vào Redis channel
   * Ví dụ: publish('socket:events', JSON.stringify({ room, event, data }))
   */
  async publish(channel: string, message: string): Promise<number> {
    return await this.redisClient.publish(channel, message);
  }

  /**
   * Subscribe vào Redis channel (cần tạo subscriber client riêng)
   * Lưu ý: IoRedis client đã subscribe không thể dùng cho command khác
   */
  createSubscriber(): Redis {
    return this.redisClient.duplicate();
  }
}
