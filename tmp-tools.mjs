import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { SSEClientTransport } from '@modelcontextprotocol/sdk/client/sse.js';

async function main() {
  const client = new Client({ name: 'test', version: '1.0' });
  const mcpSecret = process.env.MCP_SECRET || 'a90fa7de73c3f81eec9bd22883f3eabcd147e80';
  const transport = new SSEClientTransport(new URL('http://127.0.0.1:3005/sse'), {
    eventSourceInit: { headers: { 'x-mcp-secret': mcpSecret} },
    requestInit: { headers: { 'x-mcp-secret': mcpSecret} },
  });
  
  await client.connect(transport);
  const tools = await client.listTools();
  console.log("TOOL STR:", JSON.stringify(tools, null, 2));
  process.exit(0);
}
main().catch(console.error);
