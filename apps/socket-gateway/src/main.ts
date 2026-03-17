import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { Logger } from 'nestjs-pino';
import { AppModule } from './app.module';

async function bootstrap(): Promise<void> {
  const app = await NestFactory.create(AppModule, { bufferLogs: true });
  const logger = app.get(Logger);
  app.useLogger(logger);
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
