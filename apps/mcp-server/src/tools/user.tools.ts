import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import prisma from '../prisma';
import { createPendingAction } from '../utils/confirm';
import { t } from '../utils/i18n';

/**
 * Nhóm D: User & System Tools (5 tools)
 * Pattern lấy từ: AdminService.getSystemConfigs(), updateSystemConfigs()
 */
export function registerUserTools(server: McpServer): void {
  // ─────────────────────────────────────────
  // 1. list_users — Query
  // ─────────────────────────────────────────
  server.tool(
    'list_users',
    'List users with pagination and optional search. Use when admin asks about users, user list, or searches for a specific user.',
    {
      page: z.number().int().positive().default(1).describe('Page number'),
      limit: z.number().int().positive().default(20).describe('Items per page'),
      search: z.string().optional().describe('Search by name, email, or phone'),
      role: z
        .enum(['ADMIN', 'USER'])
        .optional()
        .describe('Filter by user role'),
      lang: z
        .enum(['vi', 'en'])
        .optional()
        .default('vi')
        .describe('Language for response (vi/en)'),
    },
    async ({ page, limit, search, role, lang }) => {
      const skip = (page - 1) * limit;

      const where = {
        ...(role && { role }),
        ...(search && {
          OR: [
            { firstName: { contains: search, mode: 'insensitive' as const } },
            { lastName: { contains: search, mode: 'insensitive' as const } },
            { email: { contains: search, mode: 'insensitive' as const } },
            { phone: { contains: search } },
          ],
        }),
      };

      const [users, total] = await Promise.all([
        prisma.user.findMany({
          where,
          skip,
          take: limit,
          orderBy: { createdAt: 'desc' },
          select: {
            id: true,
            firstName: true,
            lastName: true,
            email: true,
            phone: true,
            role: true,
            createdAt: true,
            _count: { select: { ownedDevices: true, ownedHomes: true } },
          },
        }),
        prisma.user.count({ where }),
      ]);

      const result = {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
        users: users.map((u) => ({
          id: u.id,
          name:
            [u.firstName, u.lastName].filter(Boolean).join(' ') ||
            t(lang, 'user.unnamed'),
          email: u.email,
          phone: u.phone,
          role: u.role,
          devices: u._count.ownedDevices,
          homes: u._count.ownedHomes,
          createdAt: u.createdAt.toISOString(),
        })),
      };

      return {
        content: [
          {
            type: 'text' as const,
            text: t(lang, 'user.list', {
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
  // 2. count_users — Query
  // ─────────────────────────────────────────
  server.tool(
    'count_users',
    'Get user registration statistics: total, new today, this week, this month. Use when admin asks "bao nhiêu user", "user mới hôm nay".',
    {
      lang: z
        .enum(['vi', 'en'])
        .optional()
        .default('vi')
        .describe('Language for response (vi/en)'),
    },
    async ({ lang }) => {
      const now = new Date();
      const startOfDay = new Date(
        now.getFullYear(),
        now.getMonth(),
        now.getDate(),
      );
      const startOfWeek = new Date(startOfDay);
      startOfWeek.setDate(startOfWeek.getDate() - startOfWeek.getDay() + 1); // Monday
      const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);

      const [total, today, thisWeek, thisMonth] = await Promise.all([
        prisma.user.count(),
        prisma.user.count({ where: { createdAt: { gte: startOfDay } } }),
        prisma.user.count({ where: { createdAt: { gte: startOfWeek } } }),
        prisma.user.count({ where: { createdAt: { gte: startOfMonth } } }),
      ]);

      const result = {
        total,
        newToday: today,
        newThisWeek: thisWeek,
        newThisMonth: thisMonth,
        date: now.toISOString(),
      };

      return {
        content: [
          {
            type: 'text' as const,
            text: t(lang, 'user.stats', {
              result: JSON.stringify(result, null, 2),
            }),
          },
        ],
      };
    },
  );

  // ─────────────────────────────────────────
  // 3. get_system_stats — Query
  // ─────────────────────────────────────────
  server.tool(
    'get_system_stats',
    'Get system-wide dashboard statistics: total users, devices, partners, hardware. Use when admin asks for system overview or dashboard stats.',
    {
      lang: z
        .enum(['vi', 'en'])
        .optional()
        .default('vi')
        .describe('Language for response (vi/en)'),
    },
    async ({ lang }) => {
      const [
        totalUsers,
        totalDevices,
        totalPartners,
        totalHardware,
        totalScenes,
        activePartners,
        bannedHardware,
      ] = await Promise.all([
        prisma.user.count(),
        prisma.device.count(),
        prisma.partner.count(),
        prisma.hardwareRegistry.count(),
        prisma.scene.count(),
        prisma.partner.count({ where: { isActive: true } }),
        prisma.hardwareRegistry.count({ where: { isBanned: true } }),
      ]);

      const result = {
        users: { total: totalUsers },
        devices: { total: totalDevices },
        partners: { total: totalPartners, active: activePartners },
        hardware: { total: totalHardware, banned: bannedHardware },
        scenes: { total: totalScenes },
        timestamp: new Date().toISOString(),
      };

      return {
        content: [
          {
            type: 'text' as const,
            text: t(lang, 'user.dashboard', {
              result: JSON.stringify(result, null, 2),
            }),
          },
        ],
      };
    },
  );

  // ─────────────────────────────────────────
  // 4. get_system_configs — Query
  // ─────────────────────────────────────────
  server.tool(
    'get_system_configs',
    'Get all system configuration values (MQTT host, OTP settings, etc). Use when admin asks about system settings.',
    {
      lang: z
        .enum(['vi', 'en'])
        .optional()
        .default('vi')
        .describe('Language for response (vi/en)'),
    },
    async ({ lang }) => {
      const configs = await prisma.systemConfig.findMany();
      const result = configs.map((c) => ({
        key: c.key,
        value: c.value,
        description: c.description,
      }));

      return {
        content: [
          {
            type: 'text' as const,
            text: t(lang, 'user.configs', {
              result: JSON.stringify(result, null, 2),
            }),
          },
        ],
      };
    },
  );

  // ─────────────────────────────────────────
  // 5. update_system_config — Mutation
  // ─────────────────────────────────────────
  server.tool(
    'update_system_config',
    'Update a system configuration value. MUTATION. Use when admin wants to change MQTT settings, OTP expire time, etc.',
    {
      key: z.string().describe('Config key (e.g. "MQTT_HOST", "OTP_EXPIRE")'),
      value: z.string().describe('New config value'),
      description: z
        .string()
        .optional()
        .describe('Description for this config key'),
      lang: z
        .enum(['vi', 'en'])
        .optional()
        .default('vi')
        .describe('Language for response (vi/en)'),
    },
    async ({ key, value, description, lang }) => {
      const existing = await prisma.systemConfig.findUnique({
        where: { key },
      });

      const actionDesc = existing
        ? t(lang, 'user.updateAction', { key, old: existing.value, new: value })
        : t(lang, 'user.createAction', { key, value });

      const msg = createPendingAction(lang, actionDesc, async () => {
        return prisma.systemConfig.upsert({
          where: { key },
          update: { value },
          create: { key, value, description: description || null },
        });
      });

      return {
        content: [{ type: 'text' as const, text: msg }],
      };
    },
  );
}
