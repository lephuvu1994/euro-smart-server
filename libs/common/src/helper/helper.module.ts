import { Module, Global } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { MailerModule } from '@nestjs-modules/mailer';
import { ConfigModule, ConfigService } from '@nestjs/config'; // Import Config để lấy env
import { HandlebarsAdapter } from '@nestjs-modules/mailer/dist/adapters/handlebars.adapter'; // Import Adapter

import { HelperEmailService } from './services/helper.email.service';
import { HelperEncryptionService } from './services/helper.encryption.service';
import { HelperPaginationService } from './services/helper.pagination.service';
import { HelperPrismaQueryBuilderService } from './services/helper.query.builder.service';
import { HelperQueryService } from './services/helper.query.service';

@Global()
@Module({
    imports: [
        // --- CHUYỂN CẤU HÌNH VÀO ĐÂY ---
        MailerModule.forRootAsync({
            imports: [ConfigModule],
            useFactory: async (config: ConfigService) => ({
                transport: {
                    host: config.get('MAIL_HOST'),
                    port: config.get('MAIL_PORT'),
                    secure: false, // true nếu dùng port 465
                    auth: {
                        user: config.get('MAIL_USER'),
                        pass: config.get('MAIL_PASSWORD'),
                    },
                },
                defaults: {
                    from: `"Smart Home" <${config.get('MAIL_FROM')}>`,
                },
                template: {
                    dir: process.cwd() + '/src/templates/email',
                    adapter: new HandlebarsAdapter(),
                    options: {
                        strict: true,
                    },
                },
            }),
            inject: [ConfigService],
        }),
    ],
    providers: [
        JwtService,
        HelperEncryptionService,
        HelperEmailService,
        HelperPaginationService,
        HelperPrismaQueryBuilderService,
        HelperQueryService,
    ],
    exports: [
        HelperEncryptionService,
        HelperEmailService,
        HelperPaginationService,
        HelperPrismaQueryBuilderService,
        HelperQueryService,
        // Có thể export MailerModule nếu module khác muốn dùng trực tiếp MailerService (không qua HelperEmailService)
        MailerModule,
    ],
})
export class HelperModule {}
