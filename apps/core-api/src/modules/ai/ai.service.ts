import { Injectable, Logger, OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { SSEClientTransport } from '@modelcontextprotocol/sdk/client/sse.js';
// Using @google/genai SDK (needs to be installed via: yarn add @google/genai)
import { GoogleGenAI } from '@google/genai';

@Injectable()
export class AiService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(AiService.name);
  private mcpClient: Client;
  private transport: SSEClientTransport;
  private ai: GoogleGenAI;
  
  // Cache of MCP tools formatted for Gemini
  private geminiToolsCache: any = null;
  private mcpToolsList: any[] = [];

  constructor() {
    this.mcpClient = new Client({
      name: 'core-api-ai',
      version: '1.0.0',
    });

    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      this.logger.warn('GEMINI_API_KEY is not set in environment variables! AI Chat will not work.');
    }
    this.ai = new GoogleGenAI({ apiKey: apiKey || 'dummy-key' });
  }

  async onModuleInit() {
    await this.connectToMcpServer();
  }

  async onModuleDestroy() {
    await this.mcpClient.close();
  }

  private async connectToMcpServer() {
    try {
      this.logger.log('Connecting to MCP Server via SSE...');
      this.transport = new SSEClientTransport(new URL('http://localhost:3005/sse'));
      await this.mcpClient.connect(this.transport);
      this.logger.log('MCP Server connected successfully.');
      
      await this.refreshTools();
    } catch (error) {
      this.logger.error('Failed to connect to MCP Server', error);
      // Optional: implement retry logic here
    }
  }

  private async refreshTools() {
    const { tools } = await this.mcpClient.listTools();
    this.mcpToolsList = tools;
    
    // Convert MCP Tools (JSON Schema) to Gemini FunctionDeclarations
    const functionDeclarations = tools.map((tool) => {
      // Basic mapping from JSON Schema to Gemini Schema
      const properties: any = {};
      const required: string[] = [];
      const inputSchema: any = tool.inputSchema || { properties: {} };
      
      Object.keys(inputSchema.properties || {}).forEach((key) => {
        properties[key] = {
          type: this.mapType(inputSchema.properties[key].type),
          description: inputSchema.properties[key].description,
        };
      });

      return {
        name: tool.name,
        description: tool.description,
        parameters: {
          type: 'OBJECT',
          properties: Object.keys(properties).length > 0 ? properties : undefined,
          required: inputSchema.required || [],
        },
      };
    });

    this.geminiToolsCache = [{ functionDeclarations }];
    this.logger.log(`Loaded ${tools.length} tools from MCP Server.`);
  }

  private mapType(jsonType: string | undefined): 'STRING' | 'NUMBER' | 'INTEGER' | 'BOOLEAN' | 'ARRAY' | 'OBJECT' {
    switch (jsonType?.toLowerCase()) {
      case 'string': return 'STRING';
      case 'number': return 'NUMBER';
      case 'integer': return 'INTEGER';
      case 'boolean': return 'BOOLEAN';
      case 'array': return 'ARRAY';
      case 'object': return 'OBJECT';
      default: return 'STRING'; // Fallback
    }
  }

  public async chat(prompt: string, lang: 'vi' | 'en' = 'vi'): Promise<string> {
    try {
      // 1. Send prompt to Gemini with tool definitions
      const response = await this.ai.models.generateContent({
        model: 'gemini-2.5-flash',
        contents: prompt,
        config: {
          systemInstruction: `You are an admin assistant for Sensa Smart Home. You can control the system using tools. The user asked to reply in language: ${lang}. When making tool calls, always pass lang: "${lang}" if the tool supports it. Focus on giving exact answers based on tool responses.`,
          tools: this.geminiToolsCache || [],
        },
      });

      // 2. Check if Gemini requested to call a tool
      const functionCalls = response.functionCalls;
      if (!functionCalls || functionCalls.length === 0) {
        return response.text; // Natural response without tool call
      }

      // 3. For simplicity, we process the first tool call (in a real app, loop all)
      const call = functionCalls[0];
      this.logger.log(`Gemini requested tool call: ${call.name}`);
      
      const args = call.args as Record<string, any>;
      args.lang = lang; // Force language into tool args

      // 4. Call MCP Server
      const mcpResult = await this.mcpClient.callTool({
        name: call.name,
        arguments: args,
      });

      let toolOutput = '';
      const contentArray = mcpResult.content as any[];
      if (contentArray && contentArray.length > 0) {
        toolOutput = contentArray[0].text || JSON.stringify(contentArray);
      }

      // 5. Send tool response back to Gemini to get final answer
      const finalResponse = await this.ai.models.generateContent({
        model: 'gemini-2.5-flash',
        contents: [
          { role: 'user', parts: [{ text: prompt }] },
          { role: 'model', parts: [{ functionCall: call }] },
          { role: 'user', parts: [{ functionResponse: { name: call.name, response: { result: toolOutput } } }] }
        ],
      });

      return finalResponse.text;
    } catch (error) {
      this.logger.error('Error during chat completion', error);
      throw error;
    }
  }
}
