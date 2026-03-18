import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { Logger } from 'nestjs-pino';
import { ConfigService } from '@nestjs/config';
import { AppModule } from './app.module';
import { RedisIoAdapter } from './adapters/redis-io.adapter';

async function bootstrap(): Promise<void> {
  const app = await NestFactory.create(AppModule, { bufferLogs: true });
  const logger = app.get(Logger);
  app.useLogger(logger);

  // Setup Redis adapter cho Socket.IO (HA multi-instance sync)
  const configService = app.get(ConfigService);
  const redisIoAdapter = new RedisIoAdapter(app, configService);
  await redisIoAdapter.connectToRedis();
  app.useWebSocketAdapter(redisIoAdapter);
  logger.log('[socket-gateway] Redis IO adapter connected');

  const port = process.env.SOCKET_GATEWAY_PORT || 3002;
  await app.listen(port);
  logger.log(`[socket-gateway] running on port ${port}`);

  // Graceful shutdown for production (PM2, K8s, Docker send SIGTERM)
  const shutdown = async (signal: string) => {
    logger.log(`[socket-gateway] ${signal} received, shutting down gracefully...`);
    await app.close();
    process.exit(0);
  };
  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT'));
}
bootstrap();

