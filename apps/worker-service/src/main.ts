import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { Logger } from 'nestjs-pino';
import { AppModule } from './app.module';

async function bootstrap(): Promise<void> {
  const app = await NestFactory.create(AppModule, { bufferLogs: true });
  const logger = app.get(Logger);
  app.useLogger(logger);
  const port = process.env.WORKER_SERVICE_PORT || 3004;
  await app.listen(port);
  logger.log(`[worker-service] running on port ${port}`);

  // Graceful shutdown for production (PM2, K8s, Docker send SIGTERM)
  const shutdown = async (signal: string) => {
    logger.log(
      `[worker-service] ${signal} received, shutting down gracefully...`,
    );
    await app.close();
    process.exit(0);
  };
  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT'));
}
bootstrap();
