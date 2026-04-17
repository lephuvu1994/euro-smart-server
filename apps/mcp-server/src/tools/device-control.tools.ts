import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import prisma from '../prisma';
import { createPendingAction } from '../utils/confirm';
import { t } from '../utils/i18n';
import Redis from 'ioredis';
import { Queue } from 'bullmq';

// Khởi tạo Redis & BullMQ
const REDIS_HOST = process.env.REDIS_HOST || 'localhost';
const REDIS_PORT = parseInt(process.env.REDIS_PORT || '6379', 10);
const REDIS_PASSWORD = process.env.REDIS_PASSWORD || undefined;

const redis = new Redis({
  host: REDIS_HOST,
  port: REDIS_PORT,
  password: REDIS_PASSWORD,
});

// Sử dụng đúng tên queue từ core-api (APP_BULLMQ_QUEUES.DEVICE_CONTROL)
const deviceQueue = new Queue('device_controll', { connection: redis });

export function registerDeviceControlTools(server: McpServer): void {
  // ─────────────────────────────────────────
  // 1. get_device_status — Query Redis
  // ─────────────────────────────────────────
  server.tool(
    'get_device_status',
    'Get real-time online/offline status and current shadow state (entity values) of a device. Use before controlling a device to know its current state.',
    {
      deviceToken: z
        .string()
        .describe(
          "The unique 'token' field of the device from list_devices (do NOT use identifier/MAC)",
        ),
    },
    async ({ deviceToken }) => {
      // Flexible lookup: if deviceToken looks like a short MAC string, it might be the identifier instead of token.
      // But Redis status strictly uses 'token'. Let's first resolve the real token via DB.
      const device = await prisma.device.findFirst({
        where: {
          OR: [{ token: deviceToken }, { identifier: deviceToken }],
        },
        select: { token: true },
      });
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
      lang: z
        .enum(['vi', 'en'])
        .optional()
        .default('vi')
        .describe('Language for response'),
    },
    async ({ deviceToken, lang }) => {
      const device = await prisma.device.findFirst({
        where: { OR: [{ token: deviceToken }, { identifier: deviceToken }] },
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
              text: t(lang, 'device.notFound', { id: deviceToken }),
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
    'Control a device by changing an entity value (e.g. turn on a switch, open a curtain). MUTATION. Requires user confirmation.',
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
      lang: z
        .enum(['vi', 'en'])
        .optional()
        .default('vi')
        .describe('Language for response'),
    },
    async ({ deviceToken, entityCode, value, lang }) => {
      // Xác minh thiết bị có tồn tại
      const device = await prisma.device.findFirst({
        where: { OR: [{ token: deviceToken }, { identifier: deviceToken }] },
        select: { id: true, name: true, token: true },
      });

      if (!device) {
        return {
          content: [
            {
              type: 'text',
              text: t(lang, 'device.notFound', { id: deviceToken }),
            },
          ],
        };
      }

      // Tạo pending action để chờ xác nhận từ user
      const msg = createPendingAction(
        lang,
        `Điều khiển thiết bị "${device.name}" (${device.token}): Đặt [${entityCode}] thành [${value}]`,
        async () => {
          // Push job vào BullMQ (tuân thủ cấu trúc DEVICE_JOBS.CONTROL_CMD)
          await deviceQueue.add(
            'control_cmd',
            {
              token: device.token,
              entityCode,
              value,
              userId: 'admin-ai', // Ghi nhận người ra lệnh là hệ thống AI
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
            message: `✅ Đã gửi lệnh điều khiển. Job ID được đưa vào hàng đợi BullMQ.`,
            status: 'queued',
            deviceToken: device.token,
            entityCode,
            value,
          };
        },
      );

      return {
        content: [{ type: 'text', text: msg }],
      };
    },
  );
}
