import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { SSEServerTransport } from '@modelcontextprotocol/sdk/server/sse.js';
import express from 'express';
import { z } from 'zod';

// Tools
import { registerPartnerTools } from './tools/partner.tools';
import { registerDeviceModelTools } from './tools/device-model.tools';
import { registerLicenseTools } from './tools/license.tools';
import { registerUserTools } from './tools/user.tools';
import { registerDeviceTools } from './tools/device.tools';

// Resources
import { registerSchemaResource } from './resources/schema.resource';

// Utils
import { executeConfirmedAction, listPendingActions } from './utils/confirm';

/**
 * Sensa Smart MCP Server
 *
 * Cung cấp 20 Admin Tools + 1 confirm tool + 1 schema resource
 * cho AI Chatbox quản trị hệ thống nhà thông minh.
 *
 * Transport: SSE HTTP (Phase 2)
 */
export async function bootstrapMcpServer() {
  const server = new McpServer({
    name: 'sensa-smart-mcp',
    version: '1.0.0',
  });

  // ─────────────────────────────────────────
  // Register ALL tool groups
  // ─────────────────────────────────────────
  registerPartnerTools(server);
  registerDeviceModelTools(server);
  registerLicenseTools(server);
  registerUserTools(server);
  registerDeviceTools(server);

  // ─────────────────────────────────────────
  // Confirm Action Tool (dùng chung cho mọi Mutation)
  // ─────────────────────────────────────────
  server.tool(
    'confirm_action',
    'Confirm and execute a pending mutation action. Use when the user says "xác nhận", "confirm", "yes", "đồng ý" after a mutation tool returned a confirmation request.',
    {
      pendingId: z
        .string()
        .describe(
          'The 8-character confirmation code from the pending action message.',
        ),
    },
    async ({ pendingId }) => {
      const result = await executeConfirmedAction(pendingId);
      return {
        content: [{ type: 'text' as const, text: result }],
      };
    },
  );

  // ─────────────────────────────────────────
  // List Pending Actions Tool
  // ─────────────────────────────────────────
  server.tool(
    'list_pending_actions',
    'List all pending mutation actions waiting for confirmation. Use when user asks what actions are waiting.',
    {
      lang: z
        .enum(['vi', 'en'])
        .optional()
        .default('vi')
        .describe('Language for response (vi/en)'),
    },
    async ({ lang }) => {
      const result = listPendingActions(lang);
      return {
        content: [{ type: 'text' as const, text: result }],
      };
    },
  );

  // ─────────────────────────────────────────
  // Register Resources
  // ─────────────────────────────────────────
  registerSchemaResource(server);

  // ─────────────────────────────────────────
  // Start SSE Transport via Express
  // ─────────────────────────────────────────
  const app = express();

  // Auth middleware — require MCP_SECRET header
  const MCP_SECRET = process.env.MCP_SECRET || '';
  app.use((req, res, next) => {
    if (MCP_SECRET) {
      const provided = req.headers['x-mcp-secret'] as string;
      if (provided !== MCP_SECRET) {
        res.status(401).json({ error: 'Unauthorized: invalid MCP secret' });
        return;
      }
    }
    next();
  });

  // Multi-session SSE support
  const transports = new Map<string, SSEServerTransport>();

  app.get('/sse', async (req, res) => {
    const transport = new SSEServerTransport('/message', res as any);
    const sessionId = Math.random().toString(36).slice(2, 10);
    transports.set(sessionId, transport);
    await server.connect(transport);
    console.error(`[sensa-smart-mcp] SSE session ${sessionId} connected. Active: ${transports.size}`);
    transport.onclose = () => {
      transports.delete(sessionId);
      console.error(`[sensa-smart-mcp] SSE session ${sessionId} closed. Active: ${transports.size}`);
    };
  });

  app.post('/message', async (req, res) => {
    // Route to the correct transport based on the sessionId query param
    // The SSEServerTransport includes sessionId in the POST URL automatically
    const sessionId = req.query.sessionId as string;
    if (sessionId && transports.has(sessionId)) {
      await transports.get(sessionId)?.handlePostMessage(req as any, res as any);
    } else if (transports.size === 1) {
      // Fallback for single-session compatibility
      const transport = transports.values().next().value;
      if (transport) {
        await transport.handlePostMessage(req as any, res as any);
      }
    } else {
      res.status(400).send('No active SSE connection for this session');
    }
  });

  return { app, server };
}

async function main(): Promise<void> {
  const { app } = await bootstrapMcpServer();
  const PORT = process.env.PORT || 3005;
  app.listen(PORT, () => {
    console.error(
      `[sensa-smart-mcp] Server started with SSE HTTP transport on http://localhost:${PORT}.`,
    );
  });
}

main().catch((error) => {
  console.error('[sensa-smart-mcp] Fatal error:', error);
  process.exit(1);
});
