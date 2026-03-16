import { Module } from '@nestjs/common';
import { DatabaseModule } from '@app/database';
import { HomeController } from './home.controller';
import { HomeService } from './home.service';

@Module({
    imports: [DatabaseModule],
    controllers: [HomeController],
    providers: [HomeService],
    exports: [HomeService],
})
export class HomeModule {}
