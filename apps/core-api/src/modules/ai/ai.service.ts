import { Injectable, Logger, OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { SSEClientTransport } from '@modelcontextprotocol/sdk/client/sse.js';
// Using @google/genai SDK (needs to be installed via: yarn add @google/genai)
import { GoogleGenAI } from '@google/genai';
import { Response } from 'express';

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

  private async connectToMcpServer(retryCount = 0) {
    const MAX_RETRIES = 5;
    try {
      this.logger.log(`Connecting to MCP Server via SSE... (attempt ${retryCount + 1})`);
      const mcpSecret = process.env.MCP_SECRET || '';
      this.transport = new SSEClientTransport(
        new URL('http://localhost:3005/sse'),
        {
          requestInit: mcpSecret ? { headers: { 'x-mcp-secret': mcpSecret } } : undefined,
        } as any,
      );
      await this.mcpClient.connect(this.transport);
      this.logger.log('MCP Server connected successfully.');
      
      await this.refreshTools();
    } catch (error) {
      this.logger.error(`Failed to connect to MCP Server (attempt ${retryCount + 1})`, error);
      if (retryCount < MAX_RETRIES) {
        const delay = Math.min(2000 * Math.pow(2, retryCount), 30000);
        this.logger.warn(`Retrying MCP connection in ${delay}ms...`);
        setTimeout(() => this.connectToMcpServer(retryCount + 1), delay);
      } else {
        this.logger.error(`Max retries (${MAX_RETRIES}) reached. MCP Server is unreachable.`);
      }
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

  // ──────────────────────────────────────────────
  // Legacy synchronous chat (kept for backward compat)
  // ──────────────────────────────────────────────

  public async chat(prompt: string, lang: 'vi' | 'en' = 'vi'): Promise<string> {
    try {
      const response = await this.ai.models.generateContent({
        model: 'gemini-2.5-flash',
        contents: prompt,
        config: {
          systemInstruction: `You are an admin assistant for Sensa Smart Home. You can control the system using tools. The user asked to reply in language: ${lang}. When making tool calls, always pass lang: "${lang}" if the tool supports it. Focus on giving exact answers based on tool responses.`,
          tools: this.geminiToolsCache || [],
        },
      });

      const functionCalls = response.functionCalls;
      if (!functionCalls || functionCalls.length === 0) {
        return response.text;
      }

      const toolResults: { name: string; result: string }[] = [];
      for (const call of functionCalls) {
        this.logger.log(`Gemini requested tool call: ${call.name}`);
        const args = { ...(call.args as Record<string, any>), lang };
        const mcpResult = await this.mcpClient.callTool({ name: call.name, arguments: args });
        let toolOutput = '';
        const contentArray = mcpResult.content as any[];
        if (contentArray && contentArray.length > 0) {
          toolOutput = contentArray[0].text || JSON.stringify(contentArray);
        }
        toolResults.push({ name: call.name, result: toolOutput });
      }

      const contentParts: any[] = [
        { role: 'user', parts: [{ text: prompt }] },
      ];
      for (let i = 0; i < functionCalls.length; i++) {
        contentParts.push(
          { role: 'model', parts: [{ functionCall: functionCalls[i] }] },
          { role: 'user', parts: [{ functionResponse: { name: toolResults[i].name, response: { result: toolResults[i].result } } }] },
        );
      }

      const finalResponse = await this.ai.models.generateContent({
        model: 'gemini-2.5-flash',
        contents: contentParts,
      });

      return finalResponse.text;
    } catch (error) {
      this.logger.error('Error during chat completion', error);
      throw error;
    }
  }

  // ──────────────────────────────────────────────
  // Phase 6: SSE Streaming Chat with conversation history
  // ──────────────────────────────────────────────

  public async chatStream(
    res: Response,
    prompt: string,
    history: Array<{ role: string; content: string }>,
    lang: 'vi' | 'en' = 'vi',
  ): Promise<void> {
    // Set SSE headers
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.setHeader('X-Accel-Buffering', 'no'); // Nginx unbuffering
    res.flushHeaders();

    const sendEvent = (event: string, data: any) => {
      res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
    };

    try {
      // Build conversation context from history
      const contents: any[] = history.map((msg) => ({
        role: msg.role === 'assistant' ? 'model' : 'user',
        parts: [{ text: msg.content }],
      }));
      // Add current prompt
      contents.push({ role: 'user', parts: [{ text: prompt }] });

      // 1. First call: get initial response (may include tool calls)
      const response = await this.ai.models.generateContent({
        model: 'gemini-2.5-flash',
        contents,
        config: {
          systemInstruction: `You are an admin assistant for Sensa Smart Home. You can control the system using tools. The user asked to reply in language: ${lang}. When making tool calls, always pass lang: "${lang}" if the tool supports it. Focus on giving exact answers based on tool responses.`,
          tools: this.geminiToolsCache || [],
        },
      });

      const functionCalls = response.functionCalls;

      // 2. If no tool calls, stream the final response directly
      if (!functionCalls || functionCalls.length === 0) {
        // Stream the final response using generateContentStream
        const stream = await this.ai.models.generateContentStream({
          model: 'gemini-2.5-flash',
          contents,
          config: {
            systemInstruction: `You are an admin assistant for Sensa Smart Home. You can control the system using tools. The user asked to reply in language: ${lang}. When making tool calls, always pass lang: "${lang}" if the tool supports it. Focus on giving exact answers based on tool responses.`,
            tools: this.geminiToolsCache || [],
          },
        });

        for await (const chunk of stream) {
          if (chunk.text) {
            sendEvent('delta', { text: chunk.text });
          }
        }
        sendEvent('done', {});
        res.end();
        return;
      }

      // 3. Has tool calls — notify frontend, then execute tools
      sendEvent('tool_start', {
        tools: functionCalls.map((c) => c.name),
      });

      const toolResults: { name: string; result: string }[] = [];
      for (const call of functionCalls) {
        this.logger.log(`[Stream] Tool call: ${call.name}`);
        sendEvent('tool_call', { name: call.name });

        const args = { ...(call.args as Record<string, any>), lang };
        const mcpResult = await this.mcpClient.callTool({
          name: call.name,
          arguments: args,
        });

        let toolOutput = '';
        const contentArray = mcpResult.content as any[];
        if (contentArray && contentArray.length > 0) {
          toolOutput = contentArray[0].text || JSON.stringify(contentArray);
        }
        toolResults.push({ name: call.name, result: toolOutput });

        sendEvent('tool_result', { name: call.name, preview: toolOutput.substring(0, 200) });
      }

      // 4. Build full context with tool results, then stream final answer
      const fullContents: any[] = [...contents];
      for (let i = 0; i < functionCalls.length; i++) {
        fullContents.push(
          { role: 'model', parts: [{ functionCall: functionCalls[i] }] },
          { role: 'user', parts: [{ functionResponse: { name: toolResults[i].name, response: { result: toolResults[i].result } } }] },
        );
      }

      sendEvent('stream_start', {});

      const finalStream = await this.ai.models.generateContentStream({
        model: 'gemini-2.5-flash',
        contents: fullContents,
      });

      for await (const chunk of finalStream) {
        if (chunk.text) {
          sendEvent('delta', { text: chunk.text });
        }
      }

      sendEvent('done', {});
      res.end();
    } catch (error) {
      this.logger.error('[Stream] Error during streaming chat', error);
      sendEvent('error', { message: error.message || 'Internal AI Error' });
      res.end();
    }
  }
}
