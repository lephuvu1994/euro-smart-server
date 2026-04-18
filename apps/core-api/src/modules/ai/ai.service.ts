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
          let connTimeoutId: NodeJS.Timeout;
          const timeoutPromise = new Promise((_, reject) => {
            connTimeoutId = setTimeout(() => reject(new Error('MCP Connect Timeout')), 5000);
          });

          await Promise.race([
            this.mcpClient.connect(transport),
            timeoutPromise,
          ]);
          clearTimeout(connTimeoutId!);
          this.logger.warn('✅ MCP Server connected successfully.');
          this.logger.warn('[MCP] Calling refreshTools (listTools)...');
          await this.refreshTools();
          this.logger.warn('[MCP] refreshTools completed.');
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
    this.logger.warn(`[Chat] Incoming stream request: "${prompt}"`);
    await this.ensureMcpConnection();
    this.logger.warn(`[Chat] MCP connection resolved. Starting SSE response...`);
    // Set SSE headers
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.setHeader('X-Accel-Buffering', 'no');
    res.flushHeaders();

    let isAborted = false;
    res.on('close', () => {
      this.logger.warn('[Stream] Client closed connection');
      isAborted = true;
    });

    const sendEvent = (event: string, data: any) => {
      if (isAborted) return;
      res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
    };

    try {
      // ── Build conversation contents ────────────────────────────────────
      const contents: any[] = history.map((msg) => ({
        role: msg.role === 'assistant' ? 'model' : 'user',
        parts: [{ text: msg.content }],
      }));
      contents.push({ role: 'user', parts: [{ text: prompt }] });

      // ── System Instruction ─────────────────────────────────────────────
      const systemInstruction = this.buildSystemInstruction(lang, userId);

      // ── Tools config ───────────────────────────────────────────────────
      const hasTools = this.geminiToolsCache?.[0]?.functionDeclarations?.length > 0;
      const combinedTools = hasTools
        ? [
          { functionDeclarations: this.geminiToolsCache[0].functionDeclarations },
          { googleSearch: {} },
        ]
        : [{ googleSearch: {} }];

      const toolsConfig = {
        tools: combinedTools,
        toolConfig: { functionCallingConfig: { mode: FunctionCallingConfigMode.AUTO } },
      };

      this.logger.warn(
        `[Chat] Starting — tools: ${hasTools ? this.geminiToolsCache[0].functionDeclarations.length : 0}, userId: ${userId ? 'set' : 'admin'}`,
      );

      // ══════════════════════════════════════════════════════════════════
      // MULTI-TURN TOOL LOOP (max 5 rounds)
      // ALL rounds use streaming for faster feedback to the user.
      // ══════════════════════════════════════════════════════════════════
      const MAX_ROUNDS = 5;
      const runningContents: any[] = [...contents];
      let streamStartSent = false;

      for (let round = 0; round < MAX_ROUNDS; round++) {
        if (isAborted) return;

        const isLastRound = round === MAX_ROUNDS - 1;
        const config = isLastRound
          ? { systemInstruction }
          : { systemInstruction, ...toolsConfig };

        this.logger.warn(`[Chat] Round ${round + 1}/${MAX_ROUNDS}`);

        // Streaming call with 30s timeout
        const streamPromise = this.ai.models.generateContentStream({
          model: AI_MODEL,
          contents: runningContents,
          config,
        });
        let timeoutId: NodeJS.Timeout;
        const timeoutPromise = new Promise<never>((_, reject) => {
          timeoutId = setTimeout(() => reject(new Error('Gemini response timeout (30s)')), 30000);
        });

        const stream = await Promise.race([streamPromise, timeoutPromise]);
        clearTimeout(timeoutId!);

        const roundFunctionCalls: any[] = [];
        const roundTextParts: string[] = [];

        for await (const chunk of stream) {
          if (isAborted) return;
          try {
            const calls = chunk.functionCalls;
            if (calls && calls.length > 0) {
              roundFunctionCalls.push(...calls);
            } else if (chunk.candidates?.[0]?.content?.parts?.[0]?.text) {
              const textOutput = chunk.candidates[0].content.parts[0].text;
              if (textOutput.trim()) {
                roundTextParts.push(textOutput);
              }
            } else if (chunk.text) { // fallback
              roundTextParts.push(chunk.text);
            }
          } catch (e) {
            // handle SDK getter warnings
          }
        }

        if (isAborted) return;

        // ── No tool calls → flush text and finish ────────────────────
        if (roundFunctionCalls.length === 0) {
          this.logger.warn(`[Chat] Round ${round + 1}: text response`);
          if (!streamStartSent) {
            sendEvent('stream_start', {});
            streamStartSent = true;
          }
          for (const text of roundTextParts) {
            if (isAborted) break;
            sendEvent('delta', { text });
          }
          if (!isAborted) {
            sendEvent('done', {});
            res.end();
          }
          return;
        }

        // ── Has tool calls → execute and loop ────────────────────────
        this.logger.warn(`[Chat] Round ${round + 1}: ${roundFunctionCalls.length} tool call(s)`);
        sendEvent('tool_start', { tools: roundFunctionCalls.map((c: any) => c.name) });

        for (const call of roundFunctionCalls) {
          if (isAborted) return;

          this.logger.warn(`[Chat] → ${call.name}`);
          sendEvent('tool_call', { name: call.name });

          let toolOutput = '';
          try {
            const args = { ...(call.args as Record<string, any>), lang };
            if (userId) args['userId'] = userId;

            const mcpResult = await this.mcpClient!.callTool({
              name: call.name,
              arguments: args,
            });

            const contentArray = mcpResult.content as any[];
            if (contentArray?.length > 0) {
              toolOutput = contentArray[0].text || JSON.stringify(contentArray);
            }
          } catch (err: any) {
            toolOutput = JSON.stringify({ error: `Tool failed: ${err?.message || err}` });
            this.logger.error(`[Chat] Tool ${call.name} failed: ${err?.message}`);
          }

          sendEvent('tool_result', { name: call.name, preview: toolOutput.substring(0, 200) });

          runningContents.push(
            { role: 'model', parts: [{ functionCall: call }] },
            {
              role: 'user',
              parts: [{
                functionResponse: {
                  name: call.name,
                  response: { result: toolOutput },
                },
              }],
            },
          );
        }
      }

      // Fallback: max rounds exhausted
      sendEvent('stream_start', {});
      sendEvent('delta', { text: 'Xin lỗi, tôi đã thực hiện quá nhiều bước. Vui lòng thử lại.' });
      sendEvent('done', {});
      res.end();
    } catch (error: any) {
      this.logger.error('[Chat] Fatal error', error);
      sendEvent('error', { message: error?.message || 'Internal AI Error' });
      res.end();
    }
  }

  // ─── Build System Instruction ───────────────────────────────────────
  private buildSystemInstruction(lang: 'vi' | 'en', userId?: string): string {
    if (userId) {
      // ── END-USER MODE ──
      return `Bạn là trợ lý AI điều khiển nhà thông minh Sensa Smart cho End-User (ID: ${userId}).

QUYỀN HẠN:
- CHỈ được điều khiển thiết bị và chạy kịch bản (scene) thuộc sở hữu của user này.
- Từ chối mọi yêu cầu thay đổi hệ thống (tạo user, xóa partner...): "Xin lỗi, chức năng này chỉ dành cho Quản trị viên."

CÁCH LÀM VIỆC (BẮT BUỘC):
- Gọi tool NGAY, KHÔNG BAO GIỜ hỏi lại "Bạn có muốn...?". Cứ làm luôn.
- Bạn đang chạy trong vòng lặp đa lượt. Gọi tool → nhận kết quả → gọi tiếp tool khác → cuối cùng mới trả lời text.
- Khi user hỏi về thiết bị: gọi list_devices → dùng token để gọi get_device_detail → trả lời.
- Khi user muốn điều khiển: gọi list_devices → get_device_detail (lấy entity codes) → control_device. PHẢI gọi đủ 3 bước.
- KHÔNG BAO GIỜ đoán entity code. LUÔN lấy từ get_device_detail.
- Mỗi yêu cầu là ĐỘC LẬP. Kết quả tool trước KHÔNG còn trong bộ nhớ. Phải gọi lại.

PHONG CÁCH:
- Trả lời ngắn gọn, thân thiện (VD: "Dạ em đã mở cửa rồi ạ").
- KHÔNG xuất JSON thô. KHÔNG hỏi token/ID từ user.
- Câu hỏi ngoài lề (thời tiết, lịch...): dùng kiến thức chung để trả lời.
- Trả lời bằng: ${lang === 'vi' ? 'tiếng Việt' : 'English'}.`;
    }

    // ── ADMIN MODE ──
    return `Bạn là trợ lý AI quản trị hệ thống Sensa Smart Home (ADMIN MODE - toàn quyền).

QUYỀN HẠN:
- Điều khiển thiết bị và chạy kịch bản: thực hiện NGAY, không cần xác nhận.
- Thay đổi hệ thống (tạo/sửa/xóa user, partner, device model...): CẦN xác nhận từ Admin.
- Nếu tool trả về chuỗi chứa "Mã xác nhận", BẮT BUỘC phải xuất nguyên văn chuỗi đó cho Admin.

CÁCH LÀM VIỆC (BẮT BUỘC):
- Gọi tool NGAY, KHÔNG BAO GIỜ hỏi lại "Bạn có muốn...?". Cứ làm luôn.
- Bạn đang chạy trong vòng lặp đa lượt. Gọi tool → nhận kết quả → gọi tiếp tool khác → cuối cùng mới trả lời text.
- Khi hỏi về thiết bị: gọi list_devices → get_device_detail → trả lời đầy đủ.
- Khi điều khiển: gọi list_devices → get_device_detail (lấy entity codes) → control_device. PHẢI gọi đủ 3 bước.
- KHÔNG BAO GIỜ đoán entity code. LUÔN lấy từ get_device_detail.
- Mỗi yêu cầu là ĐỘC LẬP. Phải gọi tool lại mỗi lần.

PHONG CÁCH:
- Trả lời tự nhiên, chuyên nghiệp. KHÔNG xuất JSON thô.
- Câu hỏi ngoài lề (thời tiết, lịch...): dùng kiến thức chung để trả lời.
- Trả lời bằng: ${lang === 'vi' ? 'tiếng Việt' : 'English'}.`;
  }
}

