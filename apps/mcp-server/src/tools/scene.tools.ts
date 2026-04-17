import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import prisma from '../prisma';
import { createOrExecuteAction } from '../utils/confirm';
import { t } from '../utils/i18n';
import { redis, deviceQueue } from '../shared/redis';


export function registerSceneTools(server: McpServer): void {
  // ─────────────────────────────────────────
  // 1. list_scenes
  // ─────────────────────────────────────────
  server.tool(
    'list_scenes',
    'List all available automation scenes. You can use this to find the sceneId needed to run a scene.',
    {
      take: z.number().optional().default(20).describe('Limit results'),
      userId: z.string().optional().describe('INTERNAL. Do NOT ask user for this value. Auto-injected by the system for ownership enforcement'),
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
          actions: true, // Only fetch minimal info + actions to see what it does
        },
      });
      return {
        content: [{ type: 'text', text: JSON.stringify(scenes, null, 2) }],
      };
    },
  );

  // ─────────────────────────────────────────
  // 2. get_scene_detail
  // ─────────────────────────────────────────
  server.tool(
    'get_scene_detail',
    'Get full details of a specific scene, including all its triggers and actions.',
    {
      sceneId: z.string().describe('The unique ID of the scene'),
      userId: z.string().optional().describe('INTERNAL. Do NOT ask user for this value. Auto-injected by the system for ownership enforcement'),
    },
    async ({ sceneId, userId }) => {
      const scene = await prisma.scene.findFirst({
        where: { 
          id: sceneId,
          ...(userId && { home: { ownerId: userId } })
        },
      });
      if (!scene) {
        return {
          content: [
            { type: 'text', text: userId ? 'Access Denied or Scene not found.' : `Scene not found with ID: ${sceneId}` },
          ],
        };
      }
      return {
        content: [{ type: 'text', text: JSON.stringify(scene, null, 2) }],
      };
    },
  );

  // ─────────────────────────────────────────
  // 3. run_scene - Push job vào BullMQ
  // ─────────────────────────────────────────
  server.tool(
    'run_scene',
    'Executes an automation scene manually by its ID. This causes the devices in actions to activate. MUTATION.',
    {
      sceneId: z.string().describe('The ID of the scene to execute'),
      userId: z.string().optional().describe('INTERNAL. Do NOT ask user for this value. Auto-injected by the system for ownership enforcement'),
      lang: z
        .enum(['vi', 'en'])
        .optional()
        .default('vi')
        .describe('Language for response'),
      delaySeconds: z
        .number()
        .optional()
        .describe('Optional delay in seconds before running the scene'),
    },
    async ({ sceneId, userId, lang, delaySeconds }) => {
      const scene = await prisma.scene.findFirst({
        where: { 
          id: sceneId,
          ...(userId && { home: { ownerId: userId } })
        },
        select: { id: true, name: true, active: true },
      });

      if (!scene) {
        return {
          content: [
            { type: 'text', text: userId ? 'Access Denied or Scene not found.' : t(lang, 'scene.error.sceneNotFound') },
          ],
        };
      }

      if (!scene.active) {
        return {
          content: [
            {
              type: 'text',
              text: 'Cannot run an inactive scene. Please provide an active scene ID.',
            },
          ],
        };
      }

      // Tạo pending action để chờ user confirm (nếu có yêu cầu từ client)
      const msg = await createOrExecuteAction(
        lang,
        `Chạy kịch bản / Run scene "${scene.name}" (ID: ${scene.id})${delaySeconds ? ` trong ${delaySeconds} giây nữa` : ''}`,
        async () => {
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
          return {
            status: 'queued',
            sceneId,
            message: `✅ Đã đưa lệnh chạy kịch bản "${scene.name}" vào hàng đợi thực thi.`,
          };
        },
        userId,
      );

      return {
        content: [{ type: 'text', text: msg }],
      };
    },
  );

  // ─────────────────────────────────────────
  // 4. toggle_scene_active - Enable/Disable
  // ─────────────────────────────────────────
  server.tool(
    'toggle_scene_active',
    'Enable or disable an automation scene. MUTATION.',
    {
      sceneId: z.string().describe('The ID of the scene'),
      active: z.boolean().describe('True to enable, false to disable'),
      userId: z.string().optional().describe('INTERNAL. Do NOT ask user for this value. Auto-injected by the system for ownership enforcement'),
      lang: z
        .enum(['vi', 'en'])
        .optional()
        .default('vi')
        .describe('Language for response'),
    },
    async ({ sceneId, active, userId, lang }) => {
      const scene = await prisma.scene.findFirst({
        where: { 
          id: sceneId,
          ...(userId && { home: { ownerId: userId } })
        },
        select: { id: true, name: true },
      });

      if (!scene) {
        return {
          content: [
            { type: 'text', text: userId ? 'Access Denied or Scene not found.' : t(lang, 'scene.error.sceneNotFound') },
          ],
        };
      }

      const msg = await createOrExecuteAction(
        lang,
        `${active ? 'Bật / Enable' : 'Tắt / Disable'} kịch bản "${scene.name}"`,
        async () => {
          const updated = await prisma.scene.update({
            where: { id: sceneId },
            data: { active },
          });
          return {
            status: 'success',
            sceneId,
            active: updated.active,
          };
        },
        userId,
      );

      return {
        content: [{ type: 'text', text: msg }],
      };
    },
  );

  // ─────────────────────────────────────────
  // 5. delete_scene - Delete
  // ─────────────────────────────────────────
  server.tool(
    'delete_scene',
    'Safely delete an automation scene from the database. MUTATION.',
    {
      sceneId: z.string(),
      userId: z.string().optional().describe('INTERNAL. Do NOT ask user for this value. Auto-injected by the system for ownership enforcement'),
      lang: z.enum(['vi', 'en']).optional().default('vi'),
    },
    async ({ sceneId, userId, lang }) => {
      const scene = await prisma.scene.findFirst({
        where: { 
          id: sceneId,
          ...(userId && { home: { ownerId: userId } })
        },
        select: { id: true, name: true },
      });
      if (!scene) {
        return {
          content: [
            { type: 'text', text: userId ? 'Access Denied or Scene not found.' : t(lang, 'scene.error.sceneNotFound') },
          ],
        };
      }

      const msg = await createOrExecuteAction(
        lang,
        `Xoá kịch bản / Delete scene "${scene.name}"`,
        async () => {
          await prisma.scene.delete({ where: { id: sceneId } });

          // Note: Full clean up might require Redis trigger index removal
          // We assume missing triggers won't crash the worker, or the user knows this is AI deleted.
          // But to be safe we can run a direct redis key removal for location or state triggers if known.
          try {
            await redis.del(`scene:triggers:${sceneId}`);
          } catch {
            // ignore
          }

          return {
            status: 'deleted',
            sceneId,
          };
        },
        userId,
      );

      return {
        content: [{ type: 'text', text: msg }],
      };
    },
  );
}
