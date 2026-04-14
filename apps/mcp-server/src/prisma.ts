import { PrismaClient } from '@prisma/client';

/**
 * Singleton PrismaClient cho MCP Server.
 * Dùng DATABASE_URL từ biến môi trường.
 */
const prisma = new PrismaClient();

export default prisma;
