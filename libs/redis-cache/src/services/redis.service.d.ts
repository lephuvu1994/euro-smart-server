import { OnModuleDestroy } from '@nestjs/common';
import Redis from 'ioredis';
export declare class RedisService implements OnModuleDestroy {
    private readonly redisClient;
    constructor(redisClient: Redis);
    onModuleDestroy(): void;
    getClient(): Redis;
    get(key: string): Promise<string | null>;
    set(key: string, value: string | number, ttl?: number): Promise<string>;
    hmset(key: string, data: Record<string, any>): Promise<number>;
    hset(key: string, fieldOrObject: string | Record<string, any>, value?: any): Promise<number>;
    hget(key: string, field: string): Promise<string | null>;
    hgetall(key: string): Promise<Record<string, string>>;
    del(key: string | string[]): Promise<number>;
    sadd(key: string, ...members: string[]): Promise<number>;
    smembers(key: string): Promise<string[]>;
    srem(key: string, ...members: string[]): Promise<number>;
    keys(pattern: string): Promise<string[]>;
    expire(key: string, seconds: number): Promise<number>;
    publish(channel: string, message: string): Promise<number>;
    createSubscriber(): Redis;
}
