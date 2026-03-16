import { Injectable, Logger } from '@nestjs/common';
import { Command } from 'nestjs-command';
import { UserRole } from '@prisma/client'; // Import Enum Role từ Prisma

// Import các Service có sẵn trong dự án
import { DatabaseService } from '@app/database';
import { HelperEncryptionService } from '@app/common/helper/services/helper.encryption.service';

@Injectable()
export class AdminMigrationSeed {
  private readonly logger = new Logger(AdminMigrationSeed.name);

  constructor(
    private readonly databaseService: DatabaseService,
    private readonly helperEncryptionService: HelperEncryptionService,
  ) {}

  @Command({
    command: 'seed:admin',
    describe: 'Create default Admin account',
  })
  async create(): Promise<void> {
    // 1. Cấu hình thông tin Admin mặc định (Nên lấy từ .env để bảo mật)
    const adminEmail = process.env.ADMIN_EMAIL || 'vulewenlian94@gmail.com';
    const adminPassword = process.env.ADMIN_PASSWORD || 'Aa123456789@';
    const adminPhone = '0988777666';

    try {
      // 2. Kiểm tra xem Admin đã tồn tại chưa
      const existingAdmin = await this.databaseService.user.findFirst({
        where: {
          email: adminEmail,
        },
      });

      if (existingAdmin) {
        this.logger.warn(
          `⚠️ Admin account (${adminEmail}) already exists. Skipping creation.`,
        );
        return;
      }

      // 3. Hash mật khẩu (Sử dụng service mã hóa chuẩn của dự án)
      const passwordHashed =
        await this.helperEncryptionService.createHash(adminPassword);

      // 4. Tạo Admin User mới
      const admin = await this.databaseService.user.create({
        data: {
          email: adminEmail,
          password: passwordHashed,
          firstName: 'System',
          lastName: 'Admin',
          phone: adminPhone,
          role: UserRole.ADMIN, // <--- QUAN TRỌNG: Set quyền ADMIN
        },
      });

      this.logger.log(`✅ Admin created successfully with ID: ${admin.id}`);
      this.logger.log(`📧 Email: ${adminEmail}`);
      this.logger.log(`🔑 Password: ${adminPassword}`);
    } catch (error) {
      this.logger.error(
        `❌ Error seeding admin: ${error.message}`,
        error.stack,
      );
    }
  }

  @Command({
    command: 'remove:admin',
    describe: 'Remove default Admin account',
  })
  async remove(): Promise<void> {
    const adminEmail = process.env.ADMIN_EMAIL || 'admin@smarthome.com';

    try {
      const user = await this.databaseService.user.findFirst({
        where: { email: adminEmail },
      });

      if (!user) {
        this.logger.warn(`User ${adminEmail} not found.`);
        return;
      }

      await this.databaseService.user.delete({
        where: { id: user.id },
      });

      this.logger.log(`🗑️ Admin account (${adminEmail}) removed.`);
    } catch (error) {
      this.logger.error(
        `❌ Error removing admin: ${error.message}`,
        error.stack,
      );
    }
  }
}
