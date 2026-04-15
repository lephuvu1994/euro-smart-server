import { PrismaClient } from '@prisma/client';
import * as dotenv from 'dotenv';
import * as fs from 'fs';
import * as path from 'path';

// Explicitly load .env.local if it exists
const envLocalPath = path.resolve(process.cwd(), '.env.local');
if (fs.existsSync(envLocalPath)) {
  dotenv.config({ path: envLocalPath, override: true });
} else {
  dotenv.config({ override: true });
}

/**
 * Singleton PrismaClient cho MCP Server.
 * Dùng DATABASE_URL từ biến môi trường.
 */
const dbUrl = process.env.DATABASE_URL || '';
console.error(`[mcp-server] Prisma connecting to: ${dbUrl.replace(/\/\/.*@/, '//***@')}`);

const prisma = new PrismaClient({
  datasources: {
    db: {
      url: dbUrl,
    },
  },
});

export default prisma;
