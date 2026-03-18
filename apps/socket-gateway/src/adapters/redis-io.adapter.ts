import { IoAdapter } from '@nestjs/platform-socket.io';
import { INestApplication, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ServerOptions } from 'socket.io';
import { createAdapter } from '@socket.io/redis-adapter';
import Redis from 'ioredis';

/**
 * RedisIoAdapter — Socket.IO adapter dùng Redis Pub/Sub
 *
 * Cho phép nhiều instance socket-gateway (trên nhiều VPS)
 * đồng bộ events qua Redis.
 *
 * Ví dụ: User A kết nối VPS2, User B kết nối VPS1
 *        → Message từ A sẽ được broadcast tới B qua Redis Pub/Sub.
 */
export class RedisIoAdapter extends IoAdapter {
  private readonly logger = new Logger(RedisIoAdapter.name);
  private adapterConstructor: ReturnType<typeof createAdapter>;

  constructor(
    app: INestApplication,
    private readonly configService: ConfigService,
  ) {
    super(app);
  }

  async connectToRedis(): Promise<void> {
    const redisConfig = {
      host: this.configService.get<string>('redis.host', 'localhost'),
      port: this.configService.get<number>('redis.port', 6379),
      password: this.configService.get<string>('redis.password'),
      username: this.configService.get<string>('redis.username', 'default'),
    };

    const pubClient = new Redis(redisConfig);
    const subClient = pubClient.duplicate();

    await Promise.all([
      new Promise<void>((resolve, reject) => {
        pubClient.on('ready', resolve);
        pubClient.on('error', reject);
      }),
      new Promise<void>((resolve, reject) => {
        subClient.on('ready', resolve);
        subClient.on('error', reject);
      }),
    ]);

    this.adapterConstructor = createAdapter(pubClient, subClient);
    this.logger.log(
      `Redis adapter connected: ${redisConfig.host}:${redisConfig.port}`,
    );
  }

  createIOServer(port: number, options?: Partial<ServerOptions>) {
    const server = super.createIOServer(port, options);
    server.adapter(this.adapterConstructor);
    return server;
  }
}
