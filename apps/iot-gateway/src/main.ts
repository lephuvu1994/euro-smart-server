import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { Logger } from 'nestjs-pino';
import { AppModule } from './app.module';

async function bootstrap(): Promise<void> {
    const app = await NestFactory.create(AppModule, { bufferLogs: true });
    const logger = app.get(Logger);
    app.useLogger(logger);
    const port = process.env.IOT_GATEWAY_PORT || 3003;
    await app.listen(port);
    logger.log(`[iot-gateway] running on port ${port}`);
    app.enableShutdownHooks();
}
bootstrap();
