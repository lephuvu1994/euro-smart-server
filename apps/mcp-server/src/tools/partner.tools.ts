import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import prisma from '../prisma';
import { createPendingAction } from '../utils/confirm';
import { t } from '../utils/i18n';

/**
 * Nhóm A: Partner Management Tools (4 tools)
 * Pattern lấy từ: apps/core-api/src/modules/admin/admin.service.ts
 */
export function registerPartnerTools(server: McpServer): void {
  // ─────────────────────────────────────────
  // 1. list_partners — Query
  // ─────────────────────────────────────────
  server.tool(
    'list_partners',
    'List all Partners/Companies with their license quota summary. Use when admin asks about partners, companies, or distributors.',
    {
      isActive: z
        .boolean()
        .optional()
        .describe('Filter by active status (true/false). Omit for all.'),
      lang: z
        .enum(['vi', 'en'])
        .optional()
        .default('vi')
        .describe('Language for response (vi/en)'),
    },
    async ({ isActive, lang }) => {
      const partners = await prisma.partner.findMany({
        where: isActive !== undefined ? { isActive } : undefined,
        orderBy: { createdAt: 'desc' },
        select: {
          code: true,
          name: true,
          isActive: true,
          createdAt: true,
          quotas: {
            select: {
              activatedCount: true,
              maxQuantity: true,
              licenseDays: true,
              isActive: true,
              deviceModel: { select: { code: true, name: true } },
            },
          },
        },
      });

      const result = partners.map((p) => ({
        companyCode: p.code,
        companyName: p.name,
        isActive: p.isActive,
        createdAt: p.createdAt.toISOString(),
        quotas: p.quotas.map((q) => ({
          modelCode: q.deviceModel.code,
          modelName: q.deviceModel.name,
          used: q.activatedCount,
          total: q.maxQuantity,
          licenseDays: q.licenseDays,
          remaining: q.maxQuantity - q.activatedCount,
        })),
      }));

      return {
        content: [
          {
            type: 'text' as const,
            text: t(lang, 'partner.list', {
              count: result.length,
              result: JSON.stringify(result, null, 2),
            }),
          },
        ],
      };
    },
  );

  // ─────────────────────────────────────────
  // 2. get_partner — Query
  // ─────────────────────────────────────────
  server.tool(
    'get_partner',
    'Get detailed info of a specific Partner by code. Includes quotas, device count.',
    {
      code: z.string().describe('Partner code (e.g. "COMPANY_A")'),
      lang: z
        .enum(['vi', 'en'])
        .optional()
        .default('vi')
        .describe('Language for response (vi/en)'),
    },
    async ({ code, lang }) => {
      const partner = await prisma.partner.findUnique({
        where: { code },
        include: {
          quotas: {
            include: { deviceModel: { select: { code: true, name: true } } },
          },
          _count: { select: { devices: true, hardwares: true } },
        },
      });

      if (!partner) {
        return {
          content: [
            {
              type: 'text' as const,
              text: t(lang, 'partner.notFound', { code }),
            },
          ],
        };
      }

      const result = {
        code: partner.code,
        name: partner.name,
        isActive: partner.isActive,
        createdAt: partner.createdAt.toISOString(),
        totalDevices: partner._count.devices,
        totalHardware: partner._count.hardwares,
        quotas: partner.quotas.map((q) => ({
          modelCode: q.deviceModel.code,
          modelName: q.deviceModel.name,
          used: q.activatedCount,
          total: q.maxQuantity,
          licenseDays: q.licenseDays,
          percentUsed:
            q.maxQuantity > 0
              ? `${Math.round((q.activatedCount / q.maxQuantity) * 100)}%`
              : '0%',
        })),
      };

      return {
        content: [
          {
            type: 'text' as const,
            text: t(lang, 'partner.detail', {
              code,
              result: JSON.stringify(result, null, 2),
            }),
          },
        ],
      };
    },
  );

  // ─────────────────────────────────────────
  // 3. create_partner — Mutation
  // ─────────────────────────────────────────
  server.tool(
    'create_partner',
    'Create a new Partner/Company. MUTATION — requires confirmation. Use when admin wants to add a new partner.',
    {
      code: z
        .string()
        .describe('Unique partner code, uppercase (e.g. "COMPANY_B")'),
      name: z.string().describe('Display name (e.g. "Công ty TNHH ABC")'),
      lang: z
        .enum(['vi', 'en'])
        .optional()
        .default('vi')
        .describe('Language for response (vi/en)'),
    },
    async ({ code, name, lang }) => {
      // Check duplicate
      const exists = await prisma.partner.findUnique({ where: { code } });
      if (exists) {
        return {
          content: [
            {
              type: 'text' as const,
              text: t(lang, 'partner.exists', { code, name: exists.name }),
            },
          ],
        };
      }

      const msg = createPendingAction(
        lang,
        t(lang, 'partner.createAction', { code, name }),
        async () => {
          return prisma.partner.create({
            data: { code, name, isActive: true },
          });
        },
      );

      return {
        content: [{ type: 'text' as const, text: msg }],
      };
    },
  );

  // ─────────────────────────────────────────
  // 4. update_partner — Mutation
  // ─────────────────────────────────────────
  server.tool(
    'update_partner',
    'Update an existing Partner name or active status. MUTATION — requires confirmation.',
    {
      code: z.string().describe('Partner code to update'),
      name: z
        .string()
        .optional()
        .describe('New display name (leave empty to keep current)'),
      isActive: z
        .boolean()
        .optional()
        .describe('Set active status (true/false)'),
      lang: z
        .enum(['vi', 'en'])
        .optional()
        .default('vi')
        .describe('Language for response (vi/en)'),
    },
    async ({ code, name, isActive, lang }) => {
      const existing = await prisma.partner.findUnique({ where: { code } });
      if (!existing) {
        return {
          content: [
            {
              type: 'text' as const,
              text: t(lang, 'partner.notFound', { code }),
            },
          ],
        };
      }

      const changes: string[] = [];
      if (name)
        changes.push(
          t(lang, 'partner.changeName', { old: existing.name, new: name }),
        );
      if (isActive !== undefined)
        changes.push(
          t(lang, 'partner.changeStatus', {
            old: existing.isActive ? 'Active' : 'Inactive',
            new: isActive ? 'Active' : 'Inactive',
          }),
        );

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

      const msg = createPendingAction(
        lang,
        t(lang, 'partner.updateAction', {
          code,
          changes: changes.join('\n'),
        }),
        async () => {
          return prisma.partner.update({
            where: { code },
            data: {
              ...(name && { name }),
              ...(isActive !== undefined && { isActive }),
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
