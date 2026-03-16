import { OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as mqtt from 'mqtt';
export declare class MqttService implements OnModuleInit, OnModuleDestroy {
  private configService;
  private client;
  private readonly logger;
  constructor(configService: ConfigService);
  onModuleInit(): void;
  onModuleDestroy(): void;
  private connect;
  publish(
    topic: string,
    message: string | object,
    options?: mqtt.IClientPublishOptions,
  ): Promise<void>;
  subscribe(
    topic: string,
    callback: (topic: string, payload: Buffer) => void,
    options?: mqtt.IClientSubscribeOptions,
  ): void;
  private matches;
  private disconnect;
}
