import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { readFileSync } from 'fs';
import { join } from 'path';

/**
 * Expose Prisma schema file as MCP Resource.
 * AI sẽ đọc resource này để hiểu cấu trúc database khi cần.
 */
export function registerSchemaResource(server: McpServer): void {
  server.resource(
    'database-schema',
    'prisma://schema',
    {
      description:
        'Full Prisma schema defining all database models, relations, and enums for the SmartHome system.',
      mimeType: 'text/plain',
    },
    async () => {
      try {
        // Đường dẫn tới schema.prisma từ thư mục gốc monorepo
        // Khi chạy dev: từ apps/mcp-server/ → ../../prisma/schema.prisma
        // Khi chạy build: từ dist/apps/mcp-server/ → ../../../prisma/schema.prisma
        const possiblePaths = [
          join(process.cwd(), 'prisma', 'schema.prisma'),
          join(__dirname, '..', '..', '..', 'prisma', 'schema.prisma'),
          join(__dirname, '..', '..', 'prisma', 'schema.prisma'),
        ];

        let schemaContent = '';
        for (const p of possiblePaths) {
          try {
            schemaContent = readFileSync(p, 'utf-8');
            break;
          } catch {
            continue;
          }
        }

        if (!schemaContent) {
          schemaContent =
            '// Schema file not found. Run from project root or check file paths.';
        }

        return {
          contents: [
            {
              uri: 'prisma://schema',
              mimeType: 'text/plain',
              text: schemaContent,
            },
          ],
        };
      } catch (error) {
        return {
          contents: [
            {
              uri: 'prisma://schema',
              mimeType: 'text/plain',
              text: `Error reading schema: ${error}`,
            },
          ],
        };
      }
    },
  );
}
