import { Injectable, Logger } from '@nestjs/common';
import { RedisService } from '@app/redis-cache';

export interface ISocketEvent {
  room: string;
  event: string;
  data: unknown;
}

export const SOCKET_EVENTS_CHANNEL = 'socket:events';

@Injectable()
export class SocketEventPublisher {
  private readonly logger = new Logger(SocketEventPublisher.name);

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
          this.logger.error(
            `Socket publish failed after 3 attempts: ${errMsg}`,
          );
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
  async emitToDevice(
    token: string,
    event: string,
    data: unknown,
  ): Promise<void> {
    const payload: ISocketEvent = {
      room: `device_${token}`,
      event,
      data,
    };
    await this.publishWithRetry(payload);
  }

  /**
   * Emit event tới home room (tất cả members của home)
   * Dùng cho SCENE_EXECUTED — 1 event thay cho N × COMMAND_SENT
   */
  async emitToHome(
    homeId: string,
    event: string,
    data: unknown,
  ): Promise<void> {
    const payload: ISocketEvent = { room: `home_${homeId}`, event, data };
    await this.publishWithRetry(payload);
  }

  /**
   * Emit cùng 1 event tới nhiều rooms trong 1 lần (batch publish).
   * Hiệu quả hơn việc gọi emitToDevice N lần riêng lẻ.
   */
  async emitBulk(rooms: string[], event: string, data: unknown): Promise<void> {
    await Promise.allSettled(
      rooms.map((room) => this.publishWithRetry({ room, event, data })),
    );
  }
}
