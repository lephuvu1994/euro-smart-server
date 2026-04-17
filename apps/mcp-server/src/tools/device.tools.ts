import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import prisma from '../prisma';
import { createPendingAction } from '../utils/confirm';
import { t } from '../utils/i18n';

/**
 * Nhóm E: Device & Hardware Tools (4 tools)
 */
export function registerDeviceTools(server: McpServer): void {
  // ─────────────────────────────────────────
  // 1. list_devices — Query
  // ─────────────────────────────────────────
  server.tool(
    'list_devices',
    'List active devices in the system (basic info only). Filter by partner or device model. Does NOT contain online/offline status - use get_device_status for that.',
    {
      partnerCode: z
        .string()
        .optional()
        .describe('Filter by partner code. Do NOT guess this value.'),
      modelCode: z
        .string()
        .optional()
        .describe(
          'Filter by exact device model code (e.g. ROLLING_DOOR). Do NOT guess this value.',
        ),
      page: z.number().int().positive().default(1).describe('Page number'),
      limit: z.number().int().positive().default(20).describe('Items per page'),
      lang: z
        .enum(['vi', 'en'])
        .optional()
        .default('vi')
        .describe('Language for response (vi/en)'),
    },
    async ({ partnerCode, modelCode, page, limit, lang }) => {
      const skip = (page - 1) * limit;

      const where = {
        unboundAt: null, // only active (non-unbound) devices
        ...(partnerCode && { partner: { code: partnerCode } }),
        ...(modelCode && { deviceModel: { code: modelCode } }),
      };

      const [devices, total] = await Promise.all([
        prisma.device.findMany({
          where,
          skip,
          take: limit,
          orderBy: { createdAt: 'desc' },
          select: {
            id: true,
            name: true,
            token: true,
            identifier: true,
            protocol: true,
            createdAt: true,
            partner: { select: { code: true, name: true } },
            deviceModel: { select: { code: true, name: true } },
            owner: {
              select: {
                firstName: true,
                lastName: true,
                email: true,
              },
            },
            _count: { select: { entities: true } },
          },
        }),
        prisma.device.count({ where }),
      ]);

      const result = {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
        devices: devices.map((d) => ({
          id: d.id,
          name: d.name,
          token: d.token,
          identifier: d.identifier,
          protocol: d.protocol,
          partner: `${d.partner.name} (${d.partner.code})`,
          model: `${d.deviceModel.name} (${d.deviceModel.code})`,
          owner:
            [d.owner.firstName, d.owner.lastName].filter(Boolean).join(' ') ||
            d.owner.email,
          entityCount: d._count.entities,
          createdAt: d.createdAt.toISOString(),
        })),
      };

      return {
        content: [
          {
            type: 'text' as const,
            text: t(lang, 'device.list', {
              page,
              totalPage: result.totalPages,
              total,
              result: JSON.stringify(result, null, 2),
            }),
          },
        ],
      };
    },
  );

  // ─────────────────────────────────────────
  // 2. count_devices_by_partner — Query
  // ─────────────────────────────────────────
  server.tool(
    'count_devices_by_partner',
    'Get device count grouped by partner. Use when admin wants a summary of which partner has how many devices.',
    {
      lang: z
        .enum(['vi', 'en'])
        .optional()
        .default('vi')
        .describe('Language for response (vi/en)'),
    },
    async ({ lang }) => {
      const partners = await prisma.partner.findMany({
        orderBy: { name: 'asc' },
        select: {
          code: true,
          name: true,
          isActive: true,
          _count: { select: { devices: true, hardwares: true } },
        },
      });

      const result = partners.map((p) => ({
        partner: `${p.name} (${p.code})`,
        isActive: p.isActive,
        activeDevices: p._count.devices,
        totalHardware: p._count.hardwares,
      }));

      const totalDevices = result.reduce((sum, p) => sum + p.activeDevices, 0);

      return {
        content: [
          {
            type: 'text' as const,
            text: t(lang, 'device.countByPartner', {
              total: totalDevices,
              result: JSON.stringify(result, null, 2),
            }),
          },
        ],
      };
    },
  );

  // ─────────────────────────────────────────
  // 3. list_hardware — Query
  // ─────────────────────────────────────────
  server.tool(
    'list_hardware',
    'List hardware registry entries (physical chips). Filter by partner, banned status. Use when admin asks about hardware, chips, MAC addresses.',
    {
      partnerCode: z.string().optional().describe('Filter by partner code'),
      modelCode: z.string().optional().describe('Filter by device model code'),
      isBanned: z
        .boolean()
        .optional()
        .describe('Filter banned hardware (true/false)'),
      page: z.number().int().positive().default(1).describe('Page number'),
      limit: z.number().int().positive().default(20).describe('Items per page'),
      lang: z
        .enum(['vi', 'en'])
        .optional()
        .default('vi')
        .describe('Language for response (vi/en)'),
    },
    async ({ partnerCode, modelCode, isBanned, page, limit, lang }) => {
      const skip = (page - 1) * limit;

      const where = {
        ...(partnerCode && { partner: { code: partnerCode } }),
        ...(modelCode && { deviceModel: { code: modelCode } }),
        ...(isBanned !== undefined && { isBanned }),
      };

      const [hardwares, total] = await Promise.all([
        prisma.hardwareRegistry.findMany({
          where,
          skip,
          take: limit,
          orderBy: { activatedAt: 'desc' },
          select: {
            id: true,
            identifier: true,
            firmwareVer: true,
            ipAddress: true,
            isBanned: true,
            activatedAt: true,
            partner: { select: { code: true, name: true } },
            deviceModel: { select: { code: true, name: true } },
            device: { select: { id: true, name: true, token: true } },
          },
        }),
        prisma.hardwareRegistry.count({ where }),
      ]);

      const result = {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
        hardware: hardwares.map((h) => ({
          id: h.id,
          identifier: h.identifier,
          firmware: h.firmwareVer || t(lang, 'device.hardwareUnupdated'),
          ipAddress: h.ipAddress || t(lang, 'device.hardwareNoIp'),
          isBanned: h.isBanned,
          partner: `${h.partner.name} (${h.partner.code})`,
          model: `${h.deviceModel.name} (${h.deviceModel.code})`,
          linkedDevice: h.device
            ? `${h.device.name} (${h.device.token})`
            : t(lang, 'device.hardwareUnlinked'),
          activatedAt: h.activatedAt.toISOString(),
        })),
      };

      return {
        content: [
          {
            type: 'text' as const,
            text: t(lang, 'device.hardware', {
              page,
              totalPage: result.totalPages,
              total,
              result: JSON.stringify(result, null, 2),
            }),
          },
        ],
      };
    },
  );

  // ─────────────────────────────────────────
  // 4. update_firmware_version — Mutation
  // ─────────────────────────────────────────
  server.tool(
    'update_firmware_version',
    'Update firmware version for all hardware entries of a device model. MUTATION. Use when admin says "cập nhật firmware", "update firmware version".',
    {
      modelCode: z
        .string()
        .describe('Device Model code (e.g. "WIFI_SWITCH_4")'),
      firmwareVersion: z
        .string()
        .describe('New firmware version string (e.g. "v2.1.0")'),
      lang: z
        .enum(['vi', 'en'])
        .optional()
        .default('vi')
        .describe('Language for response (vi/en)'),
    },
    async ({ modelCode, firmwareVersion, lang }) => {
      const model = await prisma.deviceModel.findUnique({
        where: { code: modelCode },
      });
      if (!model) {
        return {
          content: [
            {
              type: 'text' as const,
              text: t(lang, 'deviceModel.notFound', { code: modelCode }),
            },
          ],
        };
      }

      const count = await prisma.hardwareRegistry.count({
        where: { deviceModelId: model.id },
      });

      const msg = createPendingAction(
        lang,
        t(lang, 'device.updateFwAction', {
          code: modelCode,
          name: model.name, // Will be ignored by i18n placeholders if not mapped, but safe
          version: firmwareVersion,
          count,
        }),
        async () => {
          const result = await prisma.hardwareRegistry.updateMany({
            where: { deviceModelId: model.id },
            data: { firmwareVer: firmwareVersion },
          });
          return {
            message: t(lang, 'device.updateFwResult', {
              version: firmwareVersion,
              count: result.count,
              code: modelCode,
            }),
            count: result.count,
          };
        },
      );

      return {
        content: [{ type: 'text' as const, text: msg }],
      };
    },
  );
}
