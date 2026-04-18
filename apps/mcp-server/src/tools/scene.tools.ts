import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import prisma from '../prisma';
import { createOrExecuteAction } from '../utils/confirm';
import { t } from '../utils/i18n';
import { deviceQueue } from '../shared/redis';

/**
 * Scene Tools — Rebuilt
 *
 * 5 tools:
 * 1. list_scenes      — Query (no auth needed for Admin)
 * 2. get_scene_detail  — Query
 * 3. run_scene         — Execute immediately via BullMQ (NO confirmation)
 * 4. toggle_scene_active — System mutation (confirmation for Admin only)
 * 5. delete_scene      — System mutation (confirmation for Admin only)
 */
export function registerSceneTools(server: McpServer): void {
  // ═══════════════════════════════════════════
  // 1. list_scenes
  // ═══════════════════════════════════════════
  server.tool(
    'list_scenes',
    'List all automation scenes. Returns scene names and IDs needed for run_scene.',
    {
      take: z.number().optional().default(20).describe('Limit results'),
      userId: z.string().optional().describe('INTERNAL — auto-injected, never ask user'),
    },
    async ({ take, userId }) => {
      const where = userId ? { home: { ownerId: userId } } : {};
      const scenes = await prisma.scene.findMany({
        where,
        take,
        orderBy: { updatedAt: 'desc' },
        select: {
          id: true,
          name: true,
          active: true,
          homeId: true,
          actions: true,
        },
      });
      return ok(scenes);
    },
  );

  // ═══════════════════════════════════════════
  // 2. get_scene_detail
  // ═══════════════════════════════════════════
  server.tool(
    'get_scene_detail',
    'Get full details of a specific scene including triggers and actions.',
    {
      sceneId: z.string().describe('The unique ID of the scene'),
      userId: z.string().optional().describe('INTERNAL — auto-injected, never ask user'),
    },
    async ({ sceneId, userId }) => {
      const scene = await prisma.scene.findFirst({
        where: {
          id: sceneId,
          ...(userId && { home: { ownerId: userId } }),
        },
      });
      if (!scene) {
        return error(userId ? 'Không tìm thấy kịch bản hoặc bạn không có quyền.' : 'Kịch bản không tồn tại.');
      }
      return ok(scene);
    },
  );

  // ═══════════════════════════════════════════
  // 3. run_scene — BullMQ (NO confirmation)
  // ═══════════════════════════════════════════
  server.tool(
    'run_scene',
    'Execute a scene immediately via BullMQ. No confirmation needed. Call list_scenes first to get the sceneId.',
    {
      sceneId: z.string().describe('The ID of the scene to execute'),
      userId: z.string().optional().describe('INTERNAL — auto-injected, never ask user'),
      delaySeconds: z.number().optional().describe('Optional delay in seconds'),
    },
    async ({ sceneId, userId, delaySeconds }) => {
      const scene = await prisma.scene.findFirst({
        where: {
          id: sceneId,
          ...(userId && { home: { ownerId: userId } }),
        },
        select: { id: true, name: true, active: true },
      });

      if (!scene) {
        return error(userId ? 'Không tìm thấy kịch bản hoặc bạn không có quyền.' : 'Kịch bản không tồn tại.');
      }

      if (!scene.active) {
        return error(`Kịch bản "${scene.name}" đang bị tắt. Không thể thực thi.`);
      }

      try {
        await deviceQueue.add(
          'run_scene',
          { sceneId },
          {
            priority: 1,
            attempts: 1,
            removeOnComplete: true,
            ...(delaySeconds ? { delay: delaySeconds * 1000 } : {}),
          },
        );

        return ok({
          status: 'queued',
          sceneName: scene.name,
          message: `Đã gửi lệnh chạy kịch bản "${scene.name}" vào hàng đợi.`,
        });
      } catch (err) {
        return error(`Lỗi khi gửi lệnh: ${String(err)}`);
      }
    },
  );

  // ═══════════════════════════════════════════
  // 4. toggle_scene_active — System Mutation
  //    Admin: needs confirmation | User: execute immediately
  // ═══════════════════════════════════════════
  server.tool(
    'toggle_scene_active',
    'Enable or disable a scene. This is a system mutation — Admin needs confirmation.',
    {
      sceneId: z.string().describe('The ID of the scene'),
      active: z.boolean().describe('true=enable, false=disable'),
      userId: z.string().optional().describe('INTERNAL — auto-injected, never ask user'),
      lang: z.enum(['vi', 'en']).optional().default('vi'),
    },
    async ({ sceneId, active, userId, lang }) => {
      const scene = await prisma.scene.findFirst({
        where: {
          id: sceneId,
          ...(userId && { home: { ownerId: userId } }),
        },
        select: { id: true, name: true },
      });

      if (!scene) {
        return error(userId ? 'Không tìm thấy kịch bản hoặc bạn không có quyền.' : 'Kịch bản không tồn tại.');
      }

      const msg = await createOrExecuteAction(
        lang,
        `${active ? 'Bật' : 'Tắt'} kịch bản "${scene.name}"`,
        async () => {
          const updated = await prisma.scene.update({
            where: { id: sceneId },
            data: { active },
          });
          return { status: 'success', sceneId, active: updated.active };
        },
        userId,
      );

      return { content: [{ type: 'text' as const, text: msg }] };
    },
  );

  // ═══════════════════════════════════════════
  // 5. delete_scene — System Mutation
  //    Admin: needs confirmation | User: execute immediately
  // ═══════════════════════════════════════════
  server.tool(
    'delete_scene',
    'Delete a scene permanently. This is a system mutation — Admin needs confirmation.',
    {
      sceneId: z.string(),
      userId: z.string().optional().describe('INTERNAL — auto-injected, never ask user'),
      lang: z.enum(['vi', 'en']).optional().default('vi'),
    },
    async ({ sceneId, userId, lang }) => {
      const scene = await prisma.scene.findFirst({
        where: {
          id: sceneId,
          ...(userId && { home: { ownerId: userId } }),
        },
        select: { id: true, name: true },
      });

      if (!scene) {
        return error(userId ? 'Không tìm thấy kịch bản hoặc bạn không có quyền.' : 'Kịch bản không tồn tại.');
      }

      const msg = await createOrExecuteAction(
        lang,
        `Xóa kịch bản "${scene.name}"`,
        async () => {
          await prisma.scene.delete({ where: { id: sceneId } });
          return { status: 'deleted', sceneId };
        },
        userId,
      );

      return { content: [{ type: 'text' as const, text: msg }] };
    },
  );
}

// ─── Helpers ──────────────────────────────────
function ok(data: any) {
  return { content: [{ type: 'text' as const, text: JSON.stringify(data, null, 2) }] };
}

function error(message: string) {
  return { content: [{ type: 'text' as const, text: JSON.stringify({ error: message }) }] };
}
