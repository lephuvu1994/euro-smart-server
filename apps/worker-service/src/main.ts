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
  app.enableShutdownHooks();
}
bootstrap();
