import { Injectable, OnModuleInit, Logger } from '@nestjs/common';
import { DatabaseService } from '@app/database';
import { SceneTriggerIndexService } from '@app/common';

@Injectable()
export class IndexRebuildService implements OnModuleInit {
  private readonly logger = new Logger(IndexRebuildService.name);

  constructor(
    private readonly prisma: DatabaseService,
    private readonly indexService: SceneTriggerIndexService,
  ) {}

  async onModuleInit(): Promise<void> {
    this.logger.log('Starting Redis trigger index rebuild...');
    // Wrap database query in an anonymous function so it can be invoked safely by the rebuildAllIndexes core
    await this.indexService.rebuildAllIndexes(async () =>
      this.prisma.scene.findMany({
        where: { active: true },
        select: { id: true, triggers: true },
      }),
    ).catch(error => {
      this.logger.error(`Failed to rebuild Redis trigger index: ${error.message}`);
    });
  }
}
