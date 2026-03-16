import { ExceptionFilter, ArgumentsHost } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { MessageService } from '../../message/services/message.service';
export declare class ResponseExceptionFilter implements ExceptionFilter {
    private readonly messageService;
    private readonly configService;
    private readonly logger;
    private readonly isDebug;
    constructor(messageService: MessageService, configService: ConfigService);
    catch(exception: unknown, host: ArgumentsHost): void;
    private translateValidationMessages;
    private initializeSentry;
    private captureSentryException;
    private sanitizeHeaders;
}
