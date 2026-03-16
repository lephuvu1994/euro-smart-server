import { OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
export declare class SmsSimService implements OnModuleInit {
    private readonly configService;
    private readonly logger;
    private modem;
    private isModemReady;
    constructor(configService: ConfigService);
    onModuleInit(): Promise<void>;
    sendSms(phoneNumber: string, message: string): Promise<void>;
    get ready(): boolean;
}
