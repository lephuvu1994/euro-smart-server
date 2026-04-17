import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import prisma from '../prisma';
import { createOrExecuteAction } from '../utils/confirm';
import { t } from '../utils/i18n';
import { redis, deviceQueue } from '../shared/redis';


export function registerDeviceControlTools(server: McpServer): void {
  // ─────────────────────────────────────────
  // 1. get_device_status — Query Redis
  // ─────────────────────────────────────────
  server.tool(
    'get_device_status',
    'Get real-time online/offline status and current shadow state (entity values) of a specific device. Use this whenever the user asks if a device is online, or before controlling a device to know its current state.',
    {
      deviceToken: z
        .string()
        .describe(
          "The unique 'token' field of the device from list_devices (do NOT use identifier/MAC)",
        ),
      userId: z.string().optional().describe('INTERNAL. Do NOT ask user for this value. Auto-injected by the system for ownership enforcement'),
    },
    async ({ deviceToken, userId }) => {
      // Flexible lookup: if deviceToken looks like a short MAC string, it might be the identifier instead of token.
      // But Redis status strictly uses 'token'. Let's first resolve the real token via DB.
      const isUuid =
        /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
          deviceToken,
        );
      const device = await prisma.device.findFirst({
        where: {
          OR: [
            ...(isUuid ? [{ id: deviceToken }] : []),
            { token: deviceToken },
            { identifier: deviceToken },
          ],
          ...(userId && { ownerId: userId }), // 🔒 RLS Enforcement
        },
        select: { token: true },
      });

      if (!device && userId) {
        return {
          content: [{ type: 'text', text: 'Access Denied: Device not found or you do not own this device.' }],
        };
      }

      const resolvedToken = device ? device.token : deviceToken;

      const [statusStr, shadowStr] = await Promise.all([
        redis.get(`status:${resolvedToken}`),
        redis.get(`device:shadow:${resolvedToken}`),
      ]);

      const isOnline = statusStr === 'online';
      const shadow = shadowStr ? JSON.parse(shadowStr) : null;

      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify(
              {
                deviceToken,
                status: isOnline ? 'online' : 'offline',
                currentValues: shadow || 'No state recorded yet',
              },
              null,
              2,
            ),
          },
        ],
      };
    },
  );

  // ─────────────────────────────────────────
  // 2. get_device_detail — Query Database
  // ─────────────────────────────────────────
  server.tool(
    'get_device_detail',
    'Get detailed information about a device, its owner, and most importantly its Entities (buttons/controls). Use to know which entityCodes can be controlled.',
    {
      deviceToken: z
        .string()
        .describe(
          "The unique 'token' field of the device from list_devices (do NOT use identifier/MAC)",
        ),
      userId: z.string().optional().describe('INTERNAL. Do NOT ask user for this value. Auto-injected by the system for ownership enforcement'),
      lang: z
        .enum(['vi', 'en'])
        .optional()
        .default('vi')
        .describe('Language for response'),
    },
    async ({ deviceToken, userId, lang }) => {
      const isUuid =
        /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
          deviceToken,
        );
      const device = await prisma.device.findFirst({
        where: {
          OR: [
            ...(isUuid ? [{ id: deviceToken }] : []),
            { token: deviceToken },
            { identifier: deviceToken },
          ],
          ...(userId && { ownerId: userId }), // 🔒 RLS Enforcement
        },
        include: {
          owner: { select: { email: true, firstName: true, lastName: true } },
          deviceModel: { select: { name: true, code: true } },
          entities: {
            select: {
              code: true,
              name: true,
              domain: true,
              readOnly: true,
            },
          },
        },
      });

      if (!device) {
        return {
          content: [
            {
              type: 'text',
              text: userId ? 'Access Denied.' : t(lang, 'device.notFound', { id: deviceToken }),
            },
          ],
        };
      }

      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify(device, null, 2),
          },
        ],
      };
    },
  );

  // ─────────────────────────────────────────
  // 3. set_device_entity_value — Mutation (BullMQ)
  // ─────────────────────────────────────────
  server.tool(
    'set_device_entity_value',
    'Control a device by changing an entity value (e.g. turn on a switch, open a curtain). MUTATION.',
    {
      deviceToken: z
        .string()
        .describe(
          "The unique 'token' field of the device from list_devices (do NOT use identifier/MAC)",
        ),
      entityCode: z
        .string()
        .describe(
          'The entity code to control (e.g. "switch_1", "window_cover")',
        ),
      value: z
        .union([z.string(), z.number(), z.boolean()])
        .describe('The new value to set (e.g. "ON", "OPEN", "CLOSE", 1, true)'),
      userId: z.string().optional().describe('INTERNAL. Do NOT ask user for this value. Auto-injected by the system for ownership enforcement'),
      lang: z
        .enum(['vi', 'en'])
        .optional()
        .default('vi')
        .describe('Language for response'),
    },
    async ({ deviceToken, entityCode, value, userId, lang }) => {
      // Xác minh thiết bị có tồn tại
      const isUuid =
        /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
          deviceToken,
        );
      const device = await prisma.device.findFirst({
        where: {
          OR: [
            ...(isUuid ? [{ id: deviceToken }] : []),
            { token: deviceToken },
            { identifier: deviceToken },
          ],
          ...(userId && { ownerId: userId }), // 🔒 RLS Enforcement
        },
        select: { id: true, name: true, token: true },
      });

      if (!device) {
        return {
          content: [
            {
              type: 'text',
              text: userId ? 'Access Denied.' : t(lang, 'device.notFound', { id: deviceToken }),
            },
          ],
        };
      }

      const actionDesc = `Điều khiển thiết bị "${device.name}" (${device.token}): Đặt [${entityCode}] thành [${value}]`;

      // Tạo pending action để chờ xác nhận từ user
      const msg = await createOrExecuteAction(
        lang || 'vi',
        actionDesc,
        async () => {
          // Push job vào BullMQ (tuân thủ cấu trúc DEVICE_JOBS.CONTROL_CMD)
          await deviceQueue.add(
            'control_cmd',
            {
              token: device.token,
              entityCode,
              value,
              userId: userId || 'admin-ai', // Ghi nhận người ra lệnh
              source: 'app',
              issuedAt: Date.now(),
            },
            {
              priority: 1,
              attempts: 1,
              removeOnComplete: true,
            },
          );

          return {
            status: 'Processing',
            message: 'Control command has been queued successfully',
            jobFilter: `Queue: deviceQueue, Token: ${deviceToken}`,
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
