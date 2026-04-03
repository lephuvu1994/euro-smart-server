import { Injectable } from '@nestjs/common';
import { RedisService } from '@app/redis-cache';

export interface ISocketEvent {
  room: string;
  event: string;
  data: unknown;
}

export const SOCKET_EVENTS_CHANNEL = 'socket:events';

@Injectable()
export class SocketEventPublisher {
  constructor(private readonly redisService: RedisService) {}

  private async publishWithRetry(payload: ISocketEvent): Promise<void> {
    for (let attempt = 1; attempt <= 3; attempt++) {
      try {
        await this.redisService.publish(
          SOCKET_EVENTS_CHANNEL,
          JSON.stringify(payload),
        );
        return;
      } catch (error: unknown) {
        if (attempt === 3) {
          const errMsg = error instanceof Error ? error.message : String(error);
          console.error(`Socket publish failed after 3 attempts: ${errMsg}`);
          return;
        }
        await new Promise((resolve) => setTimeout(resolve, attempt * 100));
      }
    }
  }

  /**
   * Emit event tới một device room qua Redis Pub/Sub
   * socket-gateway sẽ subscribe channel này và emit cho client
   */
  async emitToDevice(token: string, event: string, data: unknown): Promise<void> {
    const payload: ISocketEvent = {
      room: `device_${token}`,
      event,
      data,
    };
    await this.publishWithRetry(payload);
  }

  /**
   * Emit event tới một room tùy chỉnh qua Redis Pub/Sub
   */
  async emitToRoom(room: string, event: string, data: unknown): Promise<void> {
    const payload: ISocketEvent = { room, event, data };
    await this.publishWithRetry(payload);
  }
}

