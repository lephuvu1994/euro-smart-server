import {
  Injectable,
  Logger,
  OnModuleInit,
  OnModuleDestroy,
} from '@nestjs/common';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { SSEClientTransport } from '@modelcontextprotocol/sdk/client/sse.js';
// Using @google/genai SDK (needs to be installed via: yarn add @google/genai)
import { FunctionCallingConfigMode, GoogleGenAI } from '@google/genai';
import { Response } from 'express';
import { AI_MODEL } from './ai.constant';

@Injectable()
export class AiService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(AiService.name);
  private mcpClient: Client | null = null;
  private ai: GoogleGenAI;
  private connectionPromise: Promise<void> | null = null;

  // Cache of MCP tools formatted for Gemini
  private geminiToolsCache: any = null;
  private mcpToolsList: any[] = [];

  constructor() {
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      this.logger.warn(
        'GEMINI_API_KEY is not set in environment variables! AI Chat will not work.',
      );
    }
    this.ai = new GoogleGenAI({ apiKey: apiKey || 'dummy-key' });
  }

  async onModuleInit() {
    // Fire-and-forget: don't block app startup
    this.connectToMcpServer();
  }

  async onModuleDestroy() {
    try {
      await this.mcpClient?.close();
    } catch {
      // ignore close errors
    }
  }

  /**
   * Ensure MCP is connected and tools are loaded.
   * Called lazily before every chat request.
   */
  private async ensureMcpConnection(): Promise<void> {
    if (this.geminiToolsCache && this.mcpToolsList.length > 0) {
      return; // Already connected & tools loaded
    }
    this.logger.warn('MCP tools not loaded — attempting reconnect...');
    await this.connectToMcpServer();
  }

  private async connectToMcpServer(retryCount = 0): Promise<void> {
    if (this.connectionPromise) {
      return this.connectionPromise;
    }

    this.connectionPromise = (async () => {
      const MAX_RETRIES = 10;
      const mcpSecret = process.env.MCP_SECRET || '';
      const mcpUrl = process.env.MCP_SERVER_URL || 'http://localhost:3005/sse';

      for (let attempt = retryCount; attempt < MAX_RETRIES; attempt++) {
        try {
          this.logger.log(
            `Connecting to MCP Server via SSE... (attempt ${attempt + 1}/${MAX_RETRIES})`,
          );

          try {
            await this.mcpClient?.close();
          } catch {
            // ignore close errors
          }

          this.mcpClient = new Client({
            name: 'core-api-ai',
            version: '1.0.0',
          });

          const authHeaders = mcpSecret
            ? { 'x-mcp-secret': mcpSecret }
            : undefined;

          const transport = new SSEClientTransport(new URL(mcpUrl), {
            eventSourceInit: authHeaders ? { headers: authHeaders } : undefined,
            requestInit: authHeaders ? { headers: authHeaders } : undefined,
          } as any);

          // Timeout to prevent hanging forever
          const timeoutPromise = new Promise((_, reject) =>
            setTimeout(() => reject(new Error('MCP Connect Timeout')), 5000),
          );

          await Promise.race([
            this.mcpClient.connect(transport),
            timeoutPromise,
          ]);
          this.logger.log('✅ MCP Server connected successfully.');

          await this.refreshTools();
          this.connectionPromise = null;
          return;
        } catch (error) {
          this.logger.error(
            `Failed to connect to MCP Server (attempt ${attempt + 1}/${MAX_RETRIES}): ${error?.message || error}`,
          );
          if (attempt < MAX_RETRIES - 1) {
            const delay = Math.min(3000 * Math.pow(2, attempt), 30000);
            this.logger.warn(`Retrying MCP connection in ${delay}ms...`);
            await new Promise((r) => setTimeout(r, delay));
          }
        }
      }

      this.connectionPromise = null;
      this.logger.error(
        `Max retries (${MAX_RETRIES}) reached. MCP Server is unreachable. Will retry on next chat request.`,
      );
    })();

    return this.connectionPromise;
  }

  private async refreshTools() {
    const { tools } = await this.mcpClient!.listTools();
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
          properties:
            Object.keys(properties).length > 0 ? properties : undefined,
          required: inputSchema.required || [],
        },
      };
    });

    this.geminiToolsCache = [{ functionDeclarations }];
    this.logger.log(`Loaded ${tools.length} tools from MCP Server.`);
  }

  private mapType(
    jsonType: string | undefined,
  ): 'STRING' | 'NUMBER' | 'INTEGER' | 'BOOLEAN' | 'ARRAY' | 'OBJECT' {
    switch (jsonType?.toLowerCase()) {
      case 'string':
        return 'STRING';
      case 'number':
        return 'NUMBER';
      case 'integer':
        return 'INTEGER';
      case 'boolean':
        return 'BOOLEAN';
      case 'array':
        return 'ARRAY';
      case 'object':
        return 'OBJECT';
      default:
        return 'STRING'; // Fallback
    }
  }

  /**
   * @deprecated Use chatStream() instead. This method lacks userId injection
   * and does NOT support conversation history or streaming.
   * Kept only for backward compatibility with Admin dashboard.
   */

  public async chat(prompt: string, lang: 'vi' | 'en' = 'vi'): Promise<string> {
    await this.ensureMcpConnection();
    try {
      const response = await this.ai.models.generateContent({
        model: AI_MODEL,
        contents: prompt,
        config: {
          systemInstruction: `You are an AI Assistant for Sensa Smart Home. You are directly connected to the system. ALWAYS call the provided tools yourself to fetch real-time smart home and system info (devices, partners, scenes, etc.) to answer the user. NEVER tell the user to use an API or run a command - YOU must execute the tool! Do not hallucinate data. For general queries (weather, lunar calendar), use your broad knowledge. DO NOT refuse. Reply in language: ${lang}.`,
          tools:
            this.geminiToolsCache &&
            this.geminiToolsCache[0]?.functionDeclarations?.length > 0
              ? this.geminiToolsCache
              : [{ googleSearch: {} }],
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
        const mcpResult = await this.mcpClient!.callTool({
          name: call.name,
          arguments: args,
        });
        let toolOutput = '';
        const contentArray = mcpResult.content as any[];
        if (contentArray && contentArray.length > 0) {
          toolOutput = contentArray[0].text || JSON.stringify(contentArray);
        }
        toolResults.push({ name: call.name, result: toolOutput });
      }

      const contentParts: any[] = [{ role: 'user', parts: [{ text: prompt }] }];
      for (let i = 0; i < functionCalls.length; i++) {
        contentParts.push(
          { role: 'model', parts: [{ functionCall: functionCalls[i] }] },
          {
            role: 'user',
            parts: [
              {
                functionResponse: {
                  name: toolResults[i].name,
                  response: { result: toolResults[i].result },
                },
              },
            ],
          },
        );
      }

      const finalResponse = await this.ai.models.generateContent({
        model: AI_MODEL,
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
    userId?: string,
  ): Promise<void> {
    await this.ensureMcpConnection();
    // Set SSE headers
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.setHeader('X-Accel-Buffering', 'no'); // Nginx unbuffering
    res.flushHeaders();

    let isAborted = false;
    res.on('close', () => {
      this.logger.warn('[Stream] Client closed connection mid-stream');
      isAborted = true;
    });

    const sendEvent = (event: string, data: any) => {
      if (isAborted) return;
      res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
    };

    try {
      // Build conversation context from history
      const contents: any[] = history.map((msg) => ({
        role: msg.role === 'assistant' ? 'model' : 'user',
        parts: [{ text: msg.content }],
      }));
      contents.push({ role: 'user', parts: [{ text: prompt }] });

      this.logger.warn(
        `[DEBUG] chatStream — tools: ${this.geminiToolsCache?.[0]?.functionDeclarations?.length ?? 0}, userId: ${userId ? 'set' : 'none'}`,
      );

      // ── Build system instruction ──────────────────────────────────────────
      const userCtx = userId
        ? `\nYou are assisting End-User ID: ${userId}. Only act on devices/scenes owned by this user.`
        : '';

      const baseSystemInstruction = userId
        ? `You are an AI Assistant for Sensa Smart Home. You are communicating with a standard End-User.
YOUR CAPABILITIES ARE STRICTLY RESTRICTED FOR SAFETY:
1. You may ONLY perform basic smart home actions: Turn On/Off, Open/Close, Adjust Temperature, Adjust Light Colors, and run Scenes.
2. You may ONLY answer general questions (weather, calendar, standard information).
3. IF the user asks you to modify the system structure, edit settings, create accounts, or do any admin/dangerous tasks, YOU MUST REFUSE and gently reply "Xin lỗi, chức năng này chỉ dành cho Quản trị viên (Admin)."
ALWAYS call the provided tools yourself to fetch data or control devices. NEVER tell the user to run a command.
After calling a tool, you MUST ALWAYS respond to the user in a natural, conversational, and very short way (e.g. "Dạ, em đã bật đèn rồi ạ", "Cửa đã được chuyển trạng thái"). NEVER OUTPUT RAW JSON.
Reply in language: ${lang}.${userCtx}`
        : `You are an AI Assistant for Sensa Smart Home acting in ADMIN MODE. You have FULL system privileges.
Because of your power, dangerous actions will require secondary confirmation.
CRITICAL: If a tool returns an Admin confirmation string (e.g. containing 'Mã xác nhận'), you MUST output exactly that entire string back to the user word-for-word, without summarizing it.
ALWAYS call the provided tools yourself to fetch real-time info. NEVER tell the user to run a command. Do not hallucinate data.
After calling a tool, you MUST ALWAYS respond to the user in a natural, conversational way. NEVER OUTPUT RAW JSON.
For general queries, use your broad knowledge. DO NOT refuse. Reply in language: ${lang}.`;

      const toolsConfig = this.geminiToolsCache &&
        this.geminiToolsCache[0]?.functionDeclarations?.length > 0
        ? {
            tools: this.geminiToolsCache,
            toolConfig: { functionCallingConfig: { mode: FunctionCallingConfigMode.AUTO } },
          }
        : { tools: [{ googleSearch: {} }] };

      // ── STEP 1: Single streaming call — collect text OR tool calls ────────
      const firstStream = await this.ai.models.generateContentStream({
        model: AI_MODEL,
        contents,
        config: { systemInstruction: baseSystemInstruction, ...toolsConfig },
      });

      const collectedFunctionCalls: any[] = [];
      const collectedTextParts: string[] = [];

      for await (const chunk of firstStream) {
        if (isAborted) return;

        // Collect any tool calls from this chunk
        if (chunk.functionCalls && chunk.functionCalls.length > 0) {
          collectedFunctionCalls.push(...chunk.functionCalls);
        }
        // Collect any text tokens (used if there are no tool calls)
        if (chunk.text) {
          collectedTextParts.push(chunk.text);
        }
      }

      if (isAborted) return;

      // ── STEP 2a: No tool calls → stream the already-collected text ────────
      if (collectedFunctionCalls.length === 0) {
        sendEvent('stream_start', {});
        for (const text of collectedTextParts) {
          if (isAborted) break;
          sendEvent('delta', { text });
        }
        if (!isAborted) {
          sendEvent('done', {});
          res.end();
        }
        return;
      }

      // ── STEP 2b: Has tool calls → execute them ───────────────────────────
      sendEvent('tool_start', { tools: collectedFunctionCalls.map((c) => c.name) });

      const toolResults: { name: string; result: string }[] = [];
      for (const call of collectedFunctionCalls) {
        if (isAborted) break;
        this.logger.log(`[Stream] Tool call: ${call.name}`);
        sendEvent('tool_call', { name: call.name });

        const args = { ...(call.args as Record<string, any>), lang };
        if (userId) {
          args['userId'] = userId; // 🛡 INJECTION FILTER: Force-inject secure user boundary
        }
        const mcpResult = await this.mcpClient!.callTool({ name: call.name, arguments: args });

        let toolOutput = '';
        const contentArray = mcpResult.content as any[];
        if (contentArray && contentArray.length > 0) {
          toolOutput = contentArray[0].text || JSON.stringify(contentArray);
        }
        toolResults.push({ name: call.name, result: toolOutput });
        sendEvent('tool_result', { name: call.name, preview: toolOutput.substring(0, 200) });
      }

      if (isAborted) return;

      // ── STEP 3: Build full context + stream final answer ──────────────────
      const fullContents: any[] = [...contents];
      for (let i = 0; i < collectedFunctionCalls.length; i++) {
        fullContents.push(
          { role: 'model', parts: [{ functionCall: collectedFunctionCalls[i] }] },
          {
            role: 'user',
            parts: [{
              functionResponse: {
                name: toolResults[i].name,
                response: { result: toolResults[i].result },
              },
            }],
          },
        );
      }

      sendEvent('stream_start', {});

      const finalStream = await this.ai.models.generateContentStream({
        model: AI_MODEL,
        contents: fullContents,
        config: { 
          systemInstruction: baseSystemInstruction,
          tools: toolsConfig.tools,
          toolConfig: { functionCallingConfig: { mode: FunctionCallingConfigMode.NONE } }
        },
      });

      for await (const chunk of finalStream) {
        if (isAborted) break;
        if (chunk.text) {
          sendEvent('delta', { text: chunk.text });
        }
      }

      if (!isAborted) {
        sendEvent('done', {});
        res.end();
      }
    } catch (error) {
      this.logger.error('[Stream] Error during streaming chat', error);
      sendEvent('error', { message: error.message || 'Internal AI Error' });
      res.end();
    }
  }

}
