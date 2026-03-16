import { Injectable, Logger } from '@nestjs/common';
import { Server } from 'socket.io';

@Injectable()
export class SocketService {
    private readonly logger = new Logger(SocketService.name);
    public server: Server = null; // Sẽ được gán từ Gateway

    // Map lưu trữ: UserId -> Danh sách Socket ID (Vì 1 user có thể login trên nhiều thiết bị)
    private readonly userConnections = new Map<string, string[]>();

    /**
     * Khi user kết nối thành công
     */
    public handleConnection(userId: string, socketId: string) {
        if (!this.userConnections.has(userId)) {
            this.userConnections.set(userId, []);
        }
        this.userConnections.get(userId).push(socketId);

        this.logger.log(`User ${userId} connected via socket ${socketId}`);
        this.logger.debug(`Current online users: ${this.userConnections.size}`);
    }

    /**
     * Khi user ngắt kết nối
     */
    public handleDisconnection(userId: string, socketId: string) {
        if (this.userConnections.has(userId)) {
            const sockets = this.userConnections.get(userId);
            const updatedSockets = sockets.filter(id => id !== socketId);

            if (updatedSockets.length === 0) {
                this.userConnections.delete(userId);
            } else {
                this.userConnections.set(userId, updatedSockets);
            }
        }
        this.logger.log(`User ${userId} disconnected socket ${socketId}`);
    }

    /**
     * Gửi tin nhắn đến 1 User cụ thể (Tương đương sendMessageUser)
     */
    public sendToUser(userId: string, event: string, payload: any) {
        const socketIds = this.userConnections.get(userId);
        if (!socketIds || socketIds.length === 0) return;

        this.logger.debug(`Sending event [${event}] to User [${userId}]`);

        // Gửi tới tất cả socket của user đó (PC, Mobile...)
        // socket.io hỗ trợ .to(socketId)
        this.server.to(socketIds).emit(event, payload);
    }

    /**
     * Gửi tin nhắn đến TẤT CẢ User (Tương đương sendMessageAllUsers)
     */
    public broadcast(event: string, payload: any) {
        if (!this.server) return;

        this.logger.debug(`Broadcasting event [${event}] to ALL users`);
        this.server.emit(event, payload);
    }

    /**
     * Gửi tin nhắn đến 1 User trừ socket hiện tại (Ví dụ: Update trạng thái nhưng ko cần gửi lại cho người vừa bấm)
     */
    public broadcastExcept(
        excludeSocketId: string,
        event: string,
        payload: any
    ) {
        if (!this.server) return;
        this.server.except(excludeSocketId).emit(event, payload);
    }
}
