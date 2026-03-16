import 'reflect-metadata';
import { ValidationPipe, VersioningType } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { NestFactory } from '@nestjs/core';
import { ExpressAdapter } from '@nestjs/platform-express';
import { useContainer } from 'class-validator';
import compression from 'compression';
import express from 'express';
import { Logger } from 'nestjs-pino';
import helmet, { HelmetOptions } from 'helmet';

import { getMCPHelmetConfig } from '@app/common/mcp/mcp.utils';
import { APP_ENVIRONMENT } from '@app/common/enums/app.enum';
import { AppModule } from './app.module';
import setupSwagger from './swagger';

async function bootstrap(): Promise<void> {
    const server = express();
    let app: any;
    try {
        app = await NestFactory.create(AppModule, new ExpressAdapter(server), { bufferLogs: true });
        const config = app.get(ConfigService);
        const logger = app.get(Logger);
        const env = config.get('app.env');
        const host = config.getOrThrow('app.http.host');
        const port = config.getOrThrow('app.http.port');
        app.use(helmet(getMCPHelmetConfig() as HelmetOptions));
        app.use(compression());
        app.useLogger(logger);
        app.enableCors(config.get('app.cors'));
        app.useGlobalPipes(new ValidationPipe({ transform: true, whitelist: true, forbidNonWhitelisted: true }));
        app.enableVersioning({ type: VersioningType.URI, defaultVersion: '1' });
        useContainer(app.select(AppModule), { fallbackOnErrors: true });
        if (env !== APP_ENVIRONMENT.PRODUCTION) setupSwagger(app);
        await app.listen(port, host);
        logger.log(`[core-api] running on: ${await app.getUrl()}`);
        if (env === APP_ENVIRONMENT.PRODUCTION) {
            const shutdown = async (s: string) => { logger.log(`${s} received`); await app.close(); process.exit(0); };
            process.on('SIGTERM', () => shutdown('SIGTERM'));
            process.on('SIGINT', () => shutdown('SIGINT'));
        } else { app.enableShutdownHooks(); }
    } catch (error) { console.error('core-api failed:', error); if (app) await app.close(); process.exit(1); }
}
bootstrap();
