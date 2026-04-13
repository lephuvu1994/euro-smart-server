import { registerAs } from '@nestjs/config';

export default registerAs('mcp', () => ({
  serverName: process.env.MCP_SERVER_NAME || 'sensa-smart-mcp',
  serverVersion: process.env.MCP_SERVER_VERSION || '1.0.0',
  logLevel: process.env.MCP_LOG_LEVEL || 'info',
}));
