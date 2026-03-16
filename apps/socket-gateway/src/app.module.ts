import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { JwtModule } from '@nestjs/jwt';
import { RedisModule } from '@app/redis-cache';
import { configs } from '@app/common';
import { CustomLoggerModule } from '@app/common/logger/logger.module';
import { HelperModule } from '@app/common/helper/helper.module';
import { SocketGateway } from './gateways/socket.gateway';
import { SocketService } from './services/socket.service';

@Module({
    imports: [
        ConfigModule.forRoot({ load: configs, isGlobal: true, cache: true, envFilePath: ['.env'], expandVariables: true }),
        RedisModule, CustomLoggerModule, JwtModule.register({}), HelperModule,
    ],
    providers: [SocketGateway, SocketService],
    exports: [SocketService],
})
export class AppModule {}
