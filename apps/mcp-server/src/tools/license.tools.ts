import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import prisma from '../prisma';
import { createPendingAction } from '../utils/confirm';
import { t } from '../utils/i18n';

/**
 * Nhóm C: License & Quota Tools (3 tools)
 * Pattern lấy từ: AdminService.getAllQuotas(), updatePartner() quotas upsert
 */
export function registerLicenseTools(server: McpServer): void {
  // ─────────────────────────────────────────
  // 1. list_quotas — Query
  // ─────────────────────────────────────────
  server.tool(
    'list_quotas',
    'List all license quotas (partner × device model). Shows used/total counts. Filter by partner or model code.',
    {
      partnerCode: z.string().optional().describe('Filter by partner code'),
      modelCode: z.string().optional().describe('Filter by device model code'),
      lang: z
        .enum(['vi', 'en'])
        .optional()
        .default('vi')
        .describe('Language for response (vi/en)'),
    },
    async ({ partnerCode, modelCode, lang }) => {
      const quotas = await prisma.licenseQuota.findMany({
        where: {
          ...(partnerCode && { partner: { code: partnerCode } }),
          ...(modelCode && { deviceModel: { code: modelCode } }),
        },
        include: {
          partner: { select: { code: true, name: true } },
          deviceModel: { select: { code: true, name: true } },
        },
        orderBy: { partner: { code: 'asc' } },
      });

      const result = quotas.map((q) => ({
        partner: `${q.partner.name} (${q.partner.code})`,
        model: `${q.deviceModel.name} (${q.deviceModel.code})`,
        used: q.activatedCount,
        total: q.maxQuantity,
        remaining: q.maxQuantity - q.activatedCount,
        licenseDays: q.licenseDays,
        isActive: q.isActive,
        percentUsed:
          q.maxQuantity > 0
            ? `${Math.round((q.activatedCount / q.maxQuantity) * 100)}%`
            : '0%',
      }));

      return {
        content: [
          {
            type: 'text' as const,
            text: t(lang, 'license.list', {
              count: result.length,
              result: JSON.stringify(result, null, 2),
            }),
          },
        ],
      };
    },
  );

  // ─────────────────────────────────────────
  // 2. set_license — Mutation
  // ─────────────────────────────────────────
  server.tool(
    'set_license',
    'Create or update license quota for a partner + device model. MUTATION. Use when admin says "cấp license", "thêm quota", "set license".',
    {
      partnerCode: z.string().describe('Partner code'),
      modelCode: z.string().describe('Device Model code'),
      maxQuantity: z.number().int().positive().describe('Max allowed devices'),
      licenseDays: z
        .number()
        .int()
        .positive()
        .default(90)
        .describe('License duration in days'),
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

      // Check existing quota
      const existing = await prisma.licenseQuota.findUnique({
        where: {
          partnerId_deviceModelId: {
            partnerId: partner.id,
            deviceModelId: model.id,
          },
        },
      });

      const actionDesc = existing
        ? t(lang, 'license.updateAction', {
            partnerName: partner.name,
            partnerCode,
            modelName: model.name,
            modelCode,
            oldMax: existing.maxQuantity,
            max: maxQuantity,
            oldDays: existing.licenseDays,
            days: licenseDays,
          })
        : t(lang, 'license.createAction', {
            partnerName: partner.name,
            partnerCode,
            modelName: model.name,
            modelCode,
            max: maxQuantity,
            days: licenseDays,
          });

      const msg = createPendingAction(lang, actionDesc, async () => {
        return prisma.licenseQuota.upsert({
          where: {
            partnerId_deviceModelId: {
              partnerId: partner.id,
              deviceModelId: model.id,
            },
          },
          update: { maxQuantity, licenseDays, isActive: true },
          create: {
            partnerId: partner.id,
            deviceModelId: model.id,
            maxQuantity,
            activatedCount: 0,
            licenseDays,
            isActive: true,
          },
        });
      });

      return {
        content: [{ type: 'text' as const, text: msg }],
      };
    },
  );

  // ─────────────────────────────────────────
  // 3. get_quota_usage — Query
  // ─────────────────────────────────────────
  server.tool(
    'get_quota_usage',
    'Get quota usage summary for a partner. Shows how many licenses used vs total per model. Use when admin asks "partner X còn bao nhiêu quota?".',
    {
      partnerCode: z.string().describe('Partner code to check usage'),
      lang: z
        .enum(['vi', 'en'])
        .optional()
        .default('vi')
        .describe('Language for response (vi/en)'),
    },
    async ({ partnerCode, lang }) => {
      const partner = await prisma.partner.findUnique({
        where: { code: partnerCode },
        include: {
          quotas: {
            include: {
              deviceModel: { select: { code: true, name: true } },
            },
          },
        },
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

      const totalMax = partner.quotas.reduce(
        (sum, q) => sum + q.maxQuantity,
        0,
      );
      const totalUsed = partner.quotas.reduce(
        (sum, q) => sum + q.activatedCount,
        0,
      );

      const summary = {
        partner: `${partner.name} (${partner.code})`,
        isActive: partner.isActive,
        totalQuota: totalMax,
        totalUsed,
        totalRemaining: totalMax - totalUsed,
        overallPercent:
          totalMax > 0 ? `${Math.round((totalUsed / totalMax) * 100)}%` : '0%',
        breakdown: partner.quotas.map((q) => ({
          model: `${q.deviceModel.name} (${q.deviceModel.code})`,
          used: q.activatedCount,
          total: q.maxQuantity,
          remaining: q.maxQuantity - q.activatedCount,
          percent:
            q.maxQuantity > 0
              ? `${Math.round((q.activatedCount / q.maxQuantity) * 100)}%`
              : '0%',
          licenseDays: q.licenseDays,
        })),
      };

      return {
        content: [
          {
            type: 'text' as const,
            text: t(lang, 'license.usage', {
              code: partnerCode,
              result: JSON.stringify(summary, null, 2),
            }),
          },
        ],
      };
    },
  );
}
