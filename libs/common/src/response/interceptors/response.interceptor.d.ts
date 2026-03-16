import { NestInterceptor, ExecutionContext, CallHandler } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Observable } from 'rxjs';
import { MessageService } from '../../message/services/message.service';
export declare class ResponseInterceptor implements NestInterceptor {
    private readonly reflector;
    private readonly messageService;
    constructor(reflector: Reflector, messageService: MessageService);
    intercept(context: ExecutionContext, next: CallHandler): Observable<any>;
}
