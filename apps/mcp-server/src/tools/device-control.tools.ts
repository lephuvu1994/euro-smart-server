import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import prisma from '../prisma';
import { t } from '../utils/i18n';
import { redis, deviceQueue } from '../shared/redis';

/**
 * Device Control Tools — Rebuilt
 *
 * 3 tools for real-time device interaction:
 * 1. get_device_status  — Redis (online/offline + shadow state)
 * 2. get_device_detail  — DB (device info + entity codes for control)
 * 3. control_device     — BullMQ (execute immediately, no confirmation)
 */
export function registerDeviceControlTools(server: McpServer): void {
  // ═══════════════════════════════════════════
  // 1. get_device_status — Redis Query
  // ═══════════════════════════════════════════
  server.tool(
    'get_device_status',
    'Get real-time online/offline status and current state values of a device from Redis. Call this to check if a device is reachable before controlling it.',
    {
      deviceToken: z
        .string()
        .describe("The device 'token' from list_devices result"),
      userId: z
        .string()
        .optional()
        .describe('INTERNAL — auto-injected, never ask user'),
    },
    async ({ deviceToken, userId }) => {
      // Resolve token (support id, token, or identifier lookup)
      const device = await resolveDevice(deviceToken, userId);
      if (!device) {
        return error(userId ? 'Không tìm thấy thiết bị hoặc bạn không có quyền.' : 'Thiết bị không tồn tại.');
      }

      try {
        const [statusStr, shadow] = await Promise.all([
          redis.get(`status:${device.token}`),
          redis.hgetall(`device:shadow:${device.token}`).then((h) =>
            h && Object.keys(h).length > 0 ? h : null,
          ),
        ]);

        return ok({
          deviceToken: device.token,
          name: device.name,
          status: statusStr === 'online' ? 'online' : 'offline',
          currentValues: shadow || 'Chưa có dữ liệu trạng thái',
        });
      } catch (err) {
        return error(`Lỗi kết nối Redis: ${String(err)}`);
      }
    },
  );

  // ═══════════════════════════════════════════
  // 2. get_device_detail — Database Query
  // ═══════════════════════════════════════════
  server.tool(
    'get_device_detail',
    'Get full device info including its controllable Entities (with entity codes). You MUST call this BEFORE control_device to learn the valid entity codes. Never guess entity codes.',
    {
      deviceToken: z
        .string()
        .describe("The device 'token' from list_devices result"),
      userId: z
        .string()
        .optional()
        .describe('INTERNAL — auto-injected, never ask user'),
    },
    async ({ deviceToken, userId }) => {
      const isUuid = UUID_RE.test(deviceToken);
      const device = await prisma.device.findFirst({
        where: {
          OR: [
            ...(isUuid ? [{ id: deviceToken }] : []),
            { token: deviceToken },
            { identifier: deviceToken },
          ],
          ...(userId && { ownerId: userId }),
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
              commandKey: true,
              commandSuffix: true,
            },
          },
        },
      });

      if (!device) {
        return error(userId ? 'Không tìm thấy thiết bị hoặc bạn không có quyền.' : 'Thiết bị không tồn tại.');
      }

      return ok({
        id: device.id,
        token: device.token,
        name: device.name,
        identifier: device.identifier,
        model: device.deviceModel,
        owner: device.owner,
        entities: device.entities.map((e) => {
          const domainHint = getDomainValidValues(e.domain);
          return {
            code: e.code,
            name: e.name,
            domain: e.domain,
            readOnly: e.readOnly,
            hint: e.readOnly
              ? '⛔ Read-only, cannot control'
              : `✅ Use code "${e.code}" in control_device. Valid values: ${domainHint}`,
          };
        }),
      });
    },
  );

  // ═══════════════════════════════════════════
  // 3. control_device — BullMQ (NO confirmation)
  // ═══════════════════════════════════════════
  server.tool(
    'control_device',
    'Control a device entity (turn on/off, open/close, etc). Executes IMMEDIATELY via BullMQ — no confirmation needed. You MUST call get_device_detail first to learn valid entity codes. Never guess codes.',
    {
      deviceToken: z
        .string()
        .describe("The device 'token' from list_devices"),
      entityCode: z
        .string()
        .describe('The exact entity code from get_device_detail (e.g. "main", "switch_1")'),
      value: z
        .union([z.string(), z.number(), z.boolean()])
        .describe('The value to set (e.g. "OPEN", "CLOSE", "ON", "OFF", true, 1)'),
      userId: z
        .string()
        .optional()
        .describe('INTERNAL — auto-injected, never ask user'),
    },
    async ({ deviceToken, entityCode, value, userId }) => {
      // 1. Resolve device + validate entity
      const device = await prisma.device.findFirst({
        where: {
          OR: [
            ...(UUID_RE.test(deviceToken) ? [{ id: deviceToken }] : []),
            { token: deviceToken },
            { identifier: deviceToken },
          ],
          ...(userId && { ownerId: userId }),
        },
        select: {
          id: true,
          name: true,
          token: true,
          entities: { select: { code: true, readOnly: true } },
        },
      });

      if (!device) {
        return error(userId ? 'Không tìm thấy thiết bị hoặc bạn không có quyền.' : 'Thiết bị không tồn tại.');
      }

      // 2. Validate entity code
      const validCodes = device.entities.filter((e) => !e.readOnly).map((e) => e.code);
      if (!device.entities.find((e) => e.code === entityCode)) {
        return error(
          `Entity "${entityCode}" không tồn tại. Các entity hợp lệ: ${validCodes.join(', ')}. Hãy gọi get_device_detail để xem danh sách chính xác.`,
        );
      }

      const entity = device.entities.find((e) => e.code === entityCode)!;
      if (entity.readOnly) {
        return error(`Entity "${entityCode}" là read-only, không thể điều khiển.`);
      }

      // 3. Push to BullMQ immediately
      try {
        await deviceQueue.add(
          'control_cmd',
          {
            token: device.token,
            entityCode,
            value,
            userId: userId || 'admin-ai',
            source: 'ai',
            issuedAt: Date.now(),
          },
          {
            priority: 1,
            attempts: 2,
            removeOnComplete: true,
          },
        );

        return ok({
          status: 'queued',
          device: device.name,
          entityCode,
          value,
          message: `Đã gửi lệnh điều khiển "${device.name}": ${entityCode} → ${value}`,
        });
      } catch (err) {
        return error(`Lỗi khi gửi lệnh: ${String(err)}`);
      }
    },
  );
}

// ─── Helpers ──────────────────────────────────
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

async function resolveDevice(tokenOrId: string, userId?: string) {
  const isUuid = UUID_RE.test(tokenOrId);
  return prisma.device.findFirst({
    where: {
      OR: [
        ...(isUuid ? [{ id: tokenOrId }] : []),
        { token: tokenOrId },
        { identifier: tokenOrId },
      ],
      ...(userId && { ownerId: userId }),
    },
    select: { token: true, name: true },
  });
}

function ok(data: any) {
  return { content: [{ type: 'text' as const, text: JSON.stringify(data, null, 2) }] };
}

function error(message: string) {
  return { content: [{ type: 'text' as const, text: JSON.stringify({ error: message }) }] };
}

function getDomainValidValues(domain: string): string {
  switch (domain.toLowerCase()) {
    case 'curtain':
    case 'cover':
      return '"OPEN", "CLOSE", "STOP", or 0-100 (percentage)';
    case 'lock':
      return '"LOCKED" or "UNLOCKED"';
    case 'switch':
    case 'plug':
    case 'light':
      return '"ON" or "OFF"';
    case 'button':
      return '"PRESS" or "ON"';
    case 'climate':
      return 'Temperature (e.g., 24), or Mode ("cool", "heat", "fan_only", "off")';
    case 'fan':
      return '"ON", "OFF", or speed (1-100)';
    default:
      return 'Check context or use ON/OFF/true/false/number values';
  }
}

