import { OnModuleInit } from '@nestjs/common';
import { HealthIndicatorResult } from '@nestjs/terminus';
import { PrismaClient } from '@prisma/client';
export declare class DatabaseService extends PrismaClient implements OnModuleInit {
    onModuleInit(): Promise<void>;
    isHealthy(): Promise<HealthIndicatorResult>;
}
