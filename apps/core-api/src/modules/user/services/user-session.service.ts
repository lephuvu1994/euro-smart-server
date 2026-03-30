import { Injectable, NotFoundException } from '@nestjs/common';
import { DatabaseService } from '@app/database';

@Injectable()
export class UserSessionService {
  constructor(private readonly databaseService: DatabaseService) {}

  async getSessions(userId: string) {
    return this.databaseService.session.findMany({
      where: { userId },
      select: {
        id: true,
        deviceName: true,
        ipAddress: true,
        userAgent: true,
        createdAt: true,
        updatedAt: true,
        expiresAt: true,
      },
      orderBy: { updatedAt: 'desc' },
    });
  }

  async revokeSession(userId: string, sessionId: string): Promise<void> {
    const session = await this.databaseService.session.findFirst({
      where: { id: sessionId, userId },
    });

    if (!session) {
      throw new NotFoundException('Session not found or forbidden');
    }

    await this.databaseService.session.delete({
      where: { id: sessionId },
    });
  }
}
