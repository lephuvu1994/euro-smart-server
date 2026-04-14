import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import prisma from '../prisma';
import { createPendingAction } from '../utils/confirm';
import { t } from '../utils/i18n';

/**
 * Nhóm B: Device Model Blueprint Tools (4 tools)
 * Pattern lấy từ: AdminService.createDeviceModel(), updateDeviceModel()
 */
export function registerDeviceModelTools(server: McpServer): void {
  // ─────────────────────────────────────────
  // 1. list_device_models — Query
  // ─────────────────────────────────────────
  server.tool(
    'list_device_models',
    'List all Device Model blueprints (product types). Shows code, name, description, and config JSON.',
    {
      lang: z
        .enum(['vi', 'en'])
        .optional()
        .default('vi')
        .describe('Language for response (vi/en)'),
    },
    async ({ lang }) => {
      const models = await prisma.deviceModel.findMany({
        orderBy: { name: 'asc' },
        select: {
          code: true,
          name: true,
          description: true,
          config: true,
          createdAt: true,
          _count: { select: { devices: true, hardwares: true } },
        },
      });

      const result = models.map((m) => ({
        code: m.code,
        name: m.name,
        description: m.description,
        activeDevices: m._count.devices,
        totalHardware: m._count.hardwares,
        createdAt: m.createdAt.toISOString(),
      }));

      return {
        content: [
          {
            type: 'text' as const,
            text: t(lang, 'deviceModel.list', {
              count: result.length,
              result: JSON.stringify(result, null, 2),
            }),
          },
        ],
      };
    },
  );

  // ─────────────────────────────────────────
  // 2. create_device_model — Mutation
  // ─────────────────────────────────────────
  server.tool(
    'create_device_model',
    'Create a new Device Model blueprint. MUTATION. Use when admin wants to add a new product type (e.g. CURTAIN_3, WIFI_SWITCH_6).',
    {
      code: z
        .string()
        .describe(
          'Unique model code, uppercase with underscores (e.g. "WIFI_SWITCH_4")',
        ),
      name: z
        .string()
        .describe('Human-readable name (e.g. "Công tắc WiFi 4 nút")'),
      description: z.string().optional().describe('Model description'),
      config: z
        .string()
        .optional()
        .describe(
          'Blueprint JSON as string defining entities and attributes. Leave empty for default.',
        ),
      lang: z
        .enum(['vi', 'en'])
        .optional()
        .default('vi')
        .describe('Language for response (vi/en)'),
    },
    async ({ code, name, description, config, lang }) => {
      const exists = await prisma.deviceModel.findUnique({
        where: { code },
      });
      if (exists) {
        return {
          content: [
            {
              type: 'text' as const,
              text: t(lang, 'deviceModel.exists', { code, name: exists.name }),
            },
          ],
        };
      }

      let parsedConfig = {};
      if (config) {
        try {
          parsedConfig = JSON.parse(config);
        } catch {
          return {
            content: [
              {
                type: 'text' as const,
                text: t(lang, 'deviceModel.invalidConfig'),
              },
            ],
          };
        }
      }

      const msg = createPendingAction(
        lang,
        t(lang, 'deviceModel.createAction', {
          code,
          name,
          desc: description || '(none)',
        }),
        async () => {
          return prisma.deviceModel.create({
            data: {
              code,
              name,
              description: description || null,
              config: parsedConfig,
            },
          });
        },
      );

      return {
        content: [{ type: 'text' as const, text: msg }],
      };
    },
  );

  // ─────────────────────────────────────────
  // 3. update_device_model — Mutation
  // ─────────────────────────────────────────
  server.tool(
    'update_device_model',
    'Update Device Model name, description, or config. MUTATION. Use when admin wants to change a product blueprint.',
    {
      code: z.string().describe('Model code to update'),
      name: z.string().optional().describe('New name'),
      description: z.string().optional().describe('New description'),
      config: z
        .string()
        .optional()
        .describe('New config JSON string (replaces entirely)'),
      lang: z
        .enum(['vi', 'en'])
        .optional()
        .default('vi')
        .describe('Language for response (vi/en)'),
    },
    async ({ code, name, description, config, lang }) => {
      const existing = await prisma.deviceModel.findUnique({
        where: { code },
      });
      if (!existing) {
        return {
          content: [
            {
              type: 'text' as const,
              text: t(lang, 'deviceModel.notFound', { code }),
            },
          ],
        };
      }

      const changes: string[] = [];
      if (name)
        changes.push(
          t(lang, 'partner.changeName', { old: existing.name, new: name }),
        );
      if (description !== undefined)
        changes.push(t(lang, 'deviceModel.changeDesc'));
      if (config) changes.push(t(lang, 'deviceModel.changeConfig'));

      if (changes.length === 0) {
        return {
          content: [
            {
              type: 'text' as const,
              text: t(lang, 'partner.noChanges'),
            },
          ],
        };
      }

      let parsedConfig: object | undefined;
      if (config) {
        try {
          parsedConfig = JSON.parse(config);
        } catch {
          return {
            content: [
              {
                type: 'text' as const,
                text: t(lang, 'deviceModel.invalidConfig'),
              },
            ],
          };
        }
      }

      const msg = createPendingAction(
        lang,
        t(lang, 'deviceModel.updateAction', {
          code,
          changes: changes.join('\n'),
        }),
        async () => {
          return prisma.deviceModel.update({
            where: { code },
            data: {
              ...(name && { name }),
              ...(description !== undefined && { description }),
              ...(parsedConfig && { config: parsedConfig }),
            },
          });
        },
      );

      return {
        content: [{ type: 'text' as const, text: msg }],
      };
    },
  );

  // ─────────────────────────────────────────
  // 4. assign_model_to_partner — Mutation
  // ─────────────────────────────────────────
  server.tool(
    'assign_model_to_partner',
    'Assign a Device Model to a Partner with license quota. MUTATION. Creates or updates the LicenseQuota entry. Use when admin says "cấp license" or "gán model cho partner".',
    {
      partnerCode: z.string().describe('Partner code (e.g. "COMPANY_A")'),
      modelCode: z
        .string()
        .describe('Device Model code (e.g. "WIFI_SWITCH_4")'),
      maxQuantity: z
        .number()
        .int()
        .positive()
        .describe('Maximum number of devices allowed'),
      licenseDays: z
        .number()
        .int()
        .positive()
        .default(90)
        .describe('License duration in days (default 90)'),
      lang: z
        .enum(['vi', 'en'])
        .optional()
        .default('vi')
        .describe('Language for response (vi/en)'),
    },
    async ({ partnerCode, modelCode, maxQuantity, licenseDays, lang }) => {
      const partner = await prisma.partner.findUnique({
        where: { code: partnerCode },
      });
      if (!partner) {
        return {
          content: [
            {
              type: 'text' as const,
              text: t(lang, 'partner.notFound', { code: partnerCode }),
            },
          ],
        };
      }

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

      const msg = createPendingAction(
        lang,
        t(lang, 'deviceModel.assignAction', {
          partnerName: partner.name,
          partnerCode,
          modelName: model.name,
          modelCode,
          max: maxQuantity,
          days: licenseDays,
        }),
        async () => {
          return prisma.licenseQuota.upsert({
            where: {
              partnerId_deviceModelId: {
                partnerId: partner.id,
                deviceModelId: model.id,
              },
            },
            update: { maxQuantity, licenseDays },
            create: {
              partnerId: partner.id,
              deviceModelId: model.id,
              maxQuantity,
              activatedCount: 0,
              licenseDays,
              isActive: true,
            },
          });
        },
      );

      return {
        content: [{ type: 'text' as const, text: msg }],
      };
    },
  );
}
