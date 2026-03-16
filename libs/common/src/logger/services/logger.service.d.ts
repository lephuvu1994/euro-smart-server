import { ConfigService } from '@nestjs/config';
import { Params } from 'nestjs-pino';
export declare const createLoggerConfig: (
  configService: ConfigService,
) => Params;
export declare class LoggerHelpers {
  static logBusinessEvent(
    logger: any,
    event: string,
    metadata?: Record<string, any>,
  ): void;
  static logPerformance(
    logger: any,
    operation: string,
    durationMs: number,
    metadata?: Record<string, any>,
  ): void;
  static logWithCorrelation(
    logger: any,
    correlationId: string,
    message: string,
    metadata?: Record<string, any>,
  ): void;
  static logSecurityEvent(
    logger: any,
    event: string,
    metadata?: Record<string, any>,
  ): void;
}
