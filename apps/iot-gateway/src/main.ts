import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { Logger } from 'nestjs-pino';
import { AppModule } from './app.module';

async function bootstrap(): Promise<void> {
  // bufferLogs: false - log ngay lập tức để Docker capture được
  // bufferLogs: true sẽ giữ log trong RAM → crash trước khi Pino attach = mất toàn bộ logs
  const app = await NestFactory.create(AppModule, { bufferLogs: false });
  const logger = app.get(Logger);
  app.useLogger(logger);
  const port = process.env.IOT_GATEWAY_PORT || 3003;
  await app.listen(port);
  logger.log(`[iot-gateway] running on port ${port}`);

  // Graceful shutdown for production (PM2, K8s, Docker send SIGTERM)
  const shutdown = async (signal: string) => {
    logger.log(`[iot-gateway] ${signal} received, shutting down gracefully...`);
    await app.close();
    process.exit(0);
  };
  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT'));
}
bootstrap();
