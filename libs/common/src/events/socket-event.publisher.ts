import { Injectable } from '@nestjs/common';
import { RedisService } from '@app/redis-cache';

export interface ISocketEvent {
    room: string;
    event: string;
    data: any;
}

export const SOCKET_EVENTS_CHANNEL = 'socket:events';

@Injectable()
export class SocketEventPublisher {
    constructor(private readonly redisService: RedisService) {}

    /**
     * Emit event tới một device room qua Redis Pub/Sub
     * socket-gateway sẽ subscribe channel này và emit cho client
     */
    async emitToDevice(token: string, event: string, data: any): Promise<void> {
        const payload: ISocketEvent = {
            room: `device_${token}`,
            event,
            data,
        };
        await this.redisService.publish(SOCKET_EVENTS_CHANNEL, JSON.stringify(payload));
    }

    /**
     * Emit event tới một room tùy chỉnh qua Redis Pub/Sub
     */
    async emitToRoom(room: string, event: string, data: any): Promise<void> {
        const payload: ISocketEvent = { room, event, data };
        await this.redisService.publish(SOCKET_EVENTS_CHANNEL, JSON.stringify(payload));
    }
}
