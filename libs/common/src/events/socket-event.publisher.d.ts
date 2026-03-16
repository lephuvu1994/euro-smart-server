import { RedisService } from '@app/redis-cache';
export interface ISocketEvent {
    room: string;
    event: string;
    data: any;
}
export declare const SOCKET_EVENTS_CHANNEL = "socket:events";
export declare class SocketEventPublisher {
    private readonly redisService;
    constructor(redisService: RedisService);
    emitToDevice(token: string, event: string, data: any): Promise<void>;
    emitToRoom(room: string, event: string, data: any): Promise<void>;
}
