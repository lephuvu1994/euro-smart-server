const { Client } = require('@modelcontextprotocol/sdk/client/index.js');
const { SSEClientTransport } = require('@modelcontextprotocol/sdk/client/sse.js');

async function main() {
  const mcpSecret = process.env.MCP_SECRET || 'a90fa7de73c3f81eec9bd22883f3eabcd147e80';
  const mcpUrl = 'http://127.0.0.1:3005/sse';
  
  const client = new Client({ name: 'test', version: '1.0' });
  const transport = new SSEClientTransport(new URL(mcpUrl), {
    requestInit: mcpSecret ? { headers: { 'x-mcp-secret': mcpSecret } } : undefined,
  });
  
  console.log("Connecting...");
  await client.connect(transport);
  console.log("Connected!");
  const tools = await client.listTools();
  console.log("Tools:", tools.tools.map(t => t.name));
  process.exit(0);
}
main().catch(console.error);
