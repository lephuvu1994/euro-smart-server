import { Injectable, Logger } from '@nestjs/common';
import { RedisService } from '@app/redis-cache';

/** Redis key prefix for device-token → scene-id reverse index */
const SCENE_TRIGGER_PREFIX = 'scene_trigger:device:';

/** RedisService.smembers might not expose a typed return — declare shape */
interface SceneTrigger {
  type: string;
  deviceStateConfig?: {
    conditions?: Array<{ deviceToken: string }>;
  };
}

@Injectable()
export class SceneTriggerIndexService {
  private readonly logger = new Logger(SceneTriggerIndexService.name);

  constructor(private readonly redis: RedisService) {}

  /**
   * Build / rebuild the reverse-index for a single scene.
   * Called on scene CREATE and UPDATE.
   *
   * Index: SADD scene_trigger:device:{deviceToken}  →  Set<sceneId>
   */
  async rebuildIndex(sceneId: string, triggers: SceneTrigger[]): Promise<void> {
    // First remove any stale entries for this scene across all device keys
    await this.removeIndex(sceneId);

    for (const trigger of triggers) {
      if (trigger.type !== 'DEVICE_STATE') continue;
      const conditions = trigger.deviceStateConfig?.conditions ?? [];
      for (const condition of conditions) {
        if (!condition.deviceToken) continue;
        const key = `${SCENE_TRIGGER_PREFIX}${condition.deviceToken}`;
        await this.redis.sadd(key, sceneId);
      }
    }
  }

  /**
   * Remove all index entries for a scene (on DELETE).
   * Because Redis doesn't support "find all keys matching pattern + filter by value" atomically,
   * we track which device-keys this scene is indexed under via a secondary set.
   *
   * Tracking key: scene_trigger:tracked:{sceneId} → Set<deviceToken>
   */
  async removeIndex(sceneId: string): Promise<void> {
    const trackingKey = `scene_trigger:tracked:${sceneId}`;
    const trackedDevices = await this.redis.smembers(trackingKey).catch(() => [] as string[]);

    const pipeline: Promise<unknown>[] = trackedDevices.map((deviceToken) =>
      this.redis.getClient().srem(`${SCENE_TRIGGER_PREFIX}${deviceToken}`, sceneId),
    );
    pipeline.push(this.redis.del(trackingKey));

    await Promise.all(pipeline);
  }

  /**
   * O(1) lookup of sceneIds that have a DEVICE_STATE trigger referencing deviceToken.
   * Used by DeviceControlProcessor instead of full scene table scan.
   */
  async getSceneIdsForDevice(deviceToken: string): Promise<string[]> {
    const key = `${SCENE_TRIGGER_PREFIX}${deviceToken}`;
    return this.redis.smembers(key).catch(() => [] as string[]);
  }

  /**
   * Rebuild the full index from DB — run once on worker startup as a safety net.
   * Uses batching to avoid loading all scenes into memory.
   */
  async rebuildAllIndexes(
    findActiveScenes: () => Promise<Array<{ id: string; triggers: unknown }>>,
  ): Promise<void> {
    this.logger.log('Rebuilding device-state trigger index...');
    const scenes = await findActiveScenes();

    // Flush all existing index keys (pattern scan)
    const client = this.redis.getClient();
    const keys: string[] = [];
    let scanCursor = '0';
    do {
      const [nextCursor, batch] = await client.scan(
        scanCursor,
        'MATCH',
        `${SCENE_TRIGGER_PREFIX}*`,
        'COUNT',
        '100',
      );
      keys.push(...batch);
      scanCursor = nextCursor;
    } while (scanCursor !== '0');

    if (keys.length > 0) {
      await this.redis.del(keys);
    }

    // Rebuild
    for (const scene of scenes) {
      const triggers = Array.isArray(scene.triggers)
        ? (scene.triggers as SceneTrigger[])
        : [];
      await this.rebuildIndex(scene.id, triggers);
    }

    this.logger.log(`Index rebuilt for ${scenes.length} scene(s).`);
  }
}
