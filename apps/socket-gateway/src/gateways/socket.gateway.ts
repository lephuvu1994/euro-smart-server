import { Logger } from '@nestjs/common';
import {
    OnGatewayConnection,
    OnGatewayDisconnect,
    OnGatewayInit,
    SubscribeMessage,
    WebSocketGateway,
    WebSocketServer,
} from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';

import { SocketService } from '../services/socket.service';

@WebSocketGateway({
    cors: {
        origin: '*', // Cấu hình CORS cho phép Frontend gọi vào
    },
    namespace: '/', // Namespace mặc định
})
export class SocketGateway
    implements OnGatewayInit, OnGatewayConnection, OnGatewayDisconnect
{
    private readonly logger = new Logger(SocketGateway.name);

    @WebSocketServer()
    server: Server;

    constructor(
        private readonly socketService: SocketService,
        private readonly jwtService: JwtService,
        private readonly configService: ConfigService
    ) {}

    /**
     * Khởi tạo Server
     */
    afterInit(server: Server) {
        this.socketService.server = server; // Gán instance server vào service để dùng ở chỗ khác
        this.logger.log('WebSocket Gateway Initialized');
    }

    /**
     * Xử lý khi có Client kết nối
     * Logic: Lấy Token từ Query hoặc Header -> Verify -> Lưu User
     */
    async handleConnection(client: Socket) {
        try {
            // 1. Lấy token từ handshake (Client gửi lên: io("url", { query: { token: "..." } }))
            const token =
                (client.handshake.query.token as string) ||
                client.handshake.headers.authorization;

            if (!token) {
                this.logger.warn(
                    `Socket ${client.id} missing token. Disconnecting...`
                );
                client.disconnect();
                return;
            }

            // 2. Verify Token (Logic tương tự validateAccessToken cũ)
            // Lưu ý: Cần xử lý bỏ chữ "Bearer " nếu lấy từ header
            const cleanToken = token.replace('Bearer ', '');

            const payload = await this.jwtService.verifyAsync(cleanToken, {
                secret: this.configService.get('auth.accessToken.secret'),
            });

            // 3. Lưu thông tin user vào socket instance để dùng sau này
            client.data.userId = payload.userId;
            client.data.role = payload.role;

            // 4. Thông báo cho Service quản lý
            this.socketService.handleConnection(payload.userId, client.id);

            // 5. Gửi event báo kết nối thành công (giống code cũ: WEBSOCKET_MESSAGE_TYPES.AUTHENTICATION.CONNECTED)
            client.emit('auth_status', {
                status: 'connected',
                userId: payload.userId,
            });
        } catch (error) {
            this.logger.error(`Socket authentication failed: ${error.message}`);
            client.disconnect();
        }
    }

    /**
     * Xử lý khi Client ngắt kết nối
     */
    handleDisconnect(client: Socket) {
        const userId = client.data.userId;
        if (userId) {
            this.socketService.handleDisconnection(userId, client.id);
        }
    }

    /**
     * (Optional) Ví dụ nhận message từ Client gửi lên
     * Tương tự: ws.on('message', ...)
     */
    @SubscribeMessage('message')
    handleMessage(client: Socket, payload: any): string {
        this.logger.log(
            `Received message from ${client.data.userId}: ${JSON.stringify(payload)}`
        );
        return 'Server received!';
    }
}
