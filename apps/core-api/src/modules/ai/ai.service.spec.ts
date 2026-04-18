import { Test, TestingModule } from '@nestjs/testing';
import { Logger } from '@nestjs/common';
import { AiService } from './ai.service';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { SSEClientTransport } from '@modelcontextprotocol/sdk/client/sse.js';

// Mock dependencies
jest.mock('@modelcontextprotocol/sdk/client/index.js');
jest.mock('@modelcontextprotocol/sdk/client/sse.js');
jest.mock('@google/genai');

describe('AiService', () => {
  let service: AiService;

  let mockMcpClient: jest.Mocked<Client>;
  let mockGoogleGenAI: any;

  beforeEach(async () => {
    // Reset mocks
    jest.clearAllMocks();

    mockMcpClient = {
      connect: jest.fn().mockResolvedValue(undefined),
      close: jest.fn().mockResolvedValue(undefined),
      listTools: jest.fn().mockResolvedValue({ tools: [] }),
      callTool: jest.fn().mockResolvedValue({ content: [] }),
    } as unknown as jest.Mocked<Client>;

    (Client as jest.Mock).mockImplementation(() => mockMcpClient);

    // Default environment
    process.env.GEMINI_API_KEY = 'test-key';

    const module: TestingModule = await Test.createTestingModule({
      providers: [AiService],
    }).compile();

    service = module.get<AiService>(AiService);

    // Access internal instances created inside constructor
    mockGoogleGenAI = (service as any).ai;
  });

  afterEach(() => {
    delete process.env.GEMINI_API_KEY;
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('Constructor', () => {
    it('should warn if GEMINI_API_KEY is not set', async () => {
      delete process.env.GEMINI_API_KEY;

      const loggerWarnSpy = jest
        .spyOn(Logger.prototype, 'warn')
        .mockImplementation(() => {
          /* empty */
        });

      const testModule = await Test.createTestingModule({
        providers: [AiService],
      }).compile();
      const testService = testModule.get<AiService>(AiService);

      expect(loggerWarnSpy).toHaveBeenCalledWith(
        'GEMINI_API_KEY is not set in environment variables! AI Chat will not work.',
      );
      expect(testService).toBeDefined();
    });
  });

  describe('onModuleInit', () => {
    it('should connect to MCP server and refresh tools', async () => {
      mockMcpClient.connect = jest.fn().mockResolvedValue(undefined);
      mockMcpClient.listTools = jest.fn().mockResolvedValue({ tools: [] });

      await service.onModuleInit();
      if ((service as any).connectionPromise) {
        await (service as any).connectionPromise;
      }

      expect(SSEClientTransport).toHaveBeenCalledTimes(1);
      expect(mockMcpClient.connect).toHaveBeenCalled();
      expect(mockMcpClient.listTools).toHaveBeenCalled();
    });

    it('should handle connection error gracefully', async () => {
      const loggerErrorSpy = jest.spyOn((service as any).logger, 'error');
      mockMcpClient.connect = jest
        .fn()
        .mockRejectedValue(new Error('Connection failed'));

      // Skip actual delay for retries to prevent test timeout
      const setTimeoutSpy = jest
        .spyOn(global, 'setTimeout')
        .mockImplementation((cb: any) => {
          cb();
          return {} as any;
        });

      await service.onModuleInit();
      if ((service as any).connectionPromise) {
        await (service as any).connectionPromise;
      }

      expect(loggerErrorSpy).toHaveBeenCalledWith(
        'Failed to connect to MCP Server (attempt 1/10): Connection failed',
      );

      setTimeoutSpy.mockRestore();
    });
  });

  describe('onModuleDestroy', () => {
    it('should close the MCP client', async () => {
      (service as any).mcpClient = mockMcpClient;
      mockMcpClient.close = jest.fn().mockResolvedValue(undefined);
      await service.onModuleDestroy();
      expect(mockMcpClient.close).toHaveBeenCalled();
    });
  });

  describe('refreshTools / type mapping', () => {
    it('should map tools cleanly and cache functional declarations', async () => {
      mockMcpClient.connect = jest.fn().mockResolvedValue(undefined);
      mockMcpClient.listTools = jest.fn().mockResolvedValue({
        tools: [
          {
            name: 'test_tool',
            description: 'Test description',
            inputSchema: {
              properties: {
                paramString: { type: 'string', description: 'desc' },
                paramNum: { type: 'number', description: 'desc' },
                paramInt: { type: 'integer', description: 'desc' },
                paramBool: { type: 'boolean', description: 'desc' },
                paramArr: { type: 'array', description: 'desc' },
                paramObj: { type: 'object', description: 'desc' },
                paramUnknown: { type: 'unknown', description: 'desc' },
              },
              required: ['paramString'],
            },
          },
          {
            name: 'empty_tool',
            description: 'Empty tool',
          },
        ],
      });

      await service.onModuleInit();
      if ((service as any).connectionPromise) {
        await (service as any).connectionPromise;
      }

      const cache = (service as any).geminiToolsCache[0];
      expect(cache.functionDeclarations).toHaveLength(3);

      const testToolDecl = cache.functionDeclarations[0];
      expect(testToolDecl.name).toBe('test_tool');
      expect(testToolDecl.parameters.properties.paramString.type).toBe(
        'STRING',
      );
      expect(testToolDecl.parameters.properties.paramNum.type).toBe('NUMBER');
      expect(testToolDecl.parameters.properties.paramInt.type).toBe('INTEGER');
      expect(testToolDecl.parameters.properties.paramBool.type).toBe('BOOLEAN');
      expect(testToolDecl.parameters.properties.paramArr.type).toBe('ARRAY');
      expect(testToolDecl.parameters.properties.paramObj.type).toBe('OBJECT');
      expect(testToolDecl.parameters.properties.paramUnknown.type).toBe(
        'STRING',
      ); // fallback
    });
  });

  describe('chat', () => {
    it('should return natural text if no function call requested', async () => {
      mockGoogleGenAI.models = {
        generateContent: jest.fn().mockResolvedValue({
          text: 'Natural response',
          functionCalls: [],
        }),
      };

      const result = await service.chat('Hello', 'vi');

      expect(result).toBe('Natural response');
      expect(mockGoogleGenAI.models.generateContent).toHaveBeenCalledTimes(1);
    });

    it('should handle tool call and return final text', async () => {
      // First genAI call returns a tool request
      const firstResponse = {
        text: '',
        functionCalls: [{ name: 'get_users', args: { limit: 5 } }],
      };

      // Final genAI call returns final answer
      const finalResponse = {
        text: 'Dưới đây là 5 users.',
        functionCalls: [],
      };

      mockGoogleGenAI.models = {
        generateContent: jest
          .fn()
          .mockResolvedValueOnce(firstResponse)
          .mockResolvedValueOnce(finalResponse),
      };

      mockMcpClient.callTool = jest.fn().mockResolvedValue({
        content: [{ text: 'User1, User2' }],
      });

      const result = await service.chat('Get users', 'vi');

      // Assertions
      expect(mockMcpClient.callTool).toHaveBeenCalledWith({
        name: 'get_users',
        arguments: { limit: 5, lang: 'vi' }, // check if lang was forced
      });

      expect(mockGoogleGenAI.models.generateContent).toHaveBeenCalledTimes(2);
      expect(result).toBe('Dưới đây là 5 users.');
    });

    it('should handle tool empty string result correctly', async () => {
      // First genAI call returns a tool request
      const firstResponse = {
        text: '',
        functionCalls: [{ name: 'get_users', args: {} }],
      };

      const finalResponse = {
        text: 'Final result',
      };

      mockGoogleGenAI.models = {
        generateContent: jest
          .fn()
          .mockResolvedValueOnce(firstResponse)
          .mockResolvedValueOnce(finalResponse),
      };

      // Empty content from MCP
      mockMcpClient.callTool = jest.fn().mockResolvedValue({
        content: [],
      });

      const result = await service.chat('Get users', 'en');

      expect(mockMcpClient.callTool).toHaveBeenCalledWith({
        name: 'get_users',
        arguments: { lang: 'en' },
      });
      expect(result).toBe('Final result');
    });

    it('should throw error if genAI fails', async () => {
      mockGoogleGenAI.models = {
        generateContent: jest.fn().mockRejectedValue(new Error('GenAI Error')),
      };

      await expect(service.chat('Hello')).rejects.toThrow('GenAI Error');
    });
  });

  describe('chatStream', () => {
    let mockRes: any;

    beforeEach(() => {
      mockRes = {
        setHeader: jest.fn(),
        flushHeaders: jest.fn(),
        write: jest.fn(),
        end: jest.fn(),
        on: jest.fn(),
      };
    });

    it('should stream final response directly if no tool calls', async () => {
      mockGoogleGenAI.models = {
        generateContentStream: jest.fn().mockResolvedValue(
          (async function* () {
            yield { text: 'Chunk 1 ' };
            yield { text: 'Chunk 2' };
          })(),
        ),
      };

      await service.chatStream(mockRes, 'Hello', []);

      expect(mockRes.setHeader).toHaveBeenCalledWith(
        'Content-Type',
        'text/event-stream',
      );
      expect(mockRes.setHeader).toHaveBeenCalledWith('X-Accel-Buffering', 'no');
      expect(mockRes.write).toHaveBeenCalledWith(
        expect.stringContaining('event: delta\ndata: {"text":"Chunk 1 "}'),
      );
      expect(mockRes.write).toHaveBeenCalledWith(
        expect.stringContaining('event: delta\ndata: {"text":"Chunk 2"}'),
      );
      expect(mockRes.write).toHaveBeenCalledWith(
        expect.stringContaining('event: done\ndata: {}'),
      );
      expect(mockRes.end).toHaveBeenCalledTimes(1);
    });

    it('should handle tool calls and emit SSE events', async () => {
      mockGoogleGenAI.models = {
        generateContentStream: jest
          .fn()
          .mockResolvedValueOnce(
            (async function* () {
              yield { functionCalls: [{ name: 'get_users', args: { limit: 2 } }] };
            })(),
          )
          .mockResolvedValueOnce(
            (async function* () {
              yield { candidates: [{ content: { parts: [{ text: 'Final Answer' }] } }] };
            })(),
          ),
      };

      mockMcpClient.callTool = jest.fn().mockResolvedValue({
        content: [{ text: 'User1, User2' }],
      });

      await service.chatStream(mockRes, 'Get users', [
        { role: 'user', content: 'prev' },
      ]);

      expect(mockRes.write).toHaveBeenCalledWith(
        expect.stringContaining(
          'event: tool_start\ndata: {"tools":["get_users"]}',
        ),
      );
      expect(mockMcpClient.callTool).toHaveBeenCalledWith({
        name: 'get_users',
        arguments: { limit: 2, lang: 'vi' },
      });
      expect(mockRes.write).toHaveBeenCalledWith(
        expect.stringContaining(
          'event: tool_result\ndata: {"name":"get_users","preview":"User1, User2"}',
        ),
      );
      expect(mockRes.write).toHaveBeenCalledWith(
        expect.stringContaining('event: stream_start\ndata: {}'),
      );
      expect(mockRes.write).toHaveBeenCalledWith(
        expect.stringContaining('event: delta\ndata: {"text":"Final Answer"}'),
      );
      expect(mockRes.end).toHaveBeenCalledTimes(1);
    });

    it('should handle client disconnection and abort processing', async () => {
      // Simulate client disconnecting (triggering 'close' event)
      mockRes.on.mockImplementation((event, cb) => {
        if (event === 'close') {
          // Immediately call the close callback to simulate abort
          cb();
        }
      });

      mockGoogleGenAI.models = {
        generateContentStream: jest.fn().mockResolvedValue(
          (async function* () {
            yield { text: 'Chunk 1' };
            // It should break here because isAborted is true
            yield { text: 'Chunk 2' };
          })(),
        ),
      };

      await service.chatStream(mockRes, 'Hello', []);

      // Because it aborted immediately, write should not be called with Chunk 1 or done
      expect(mockRes.write).not.toHaveBeenCalled();
      expect(mockRes.end).not.toHaveBeenCalled();
    });
    it('should intercept ask_general_knowledge tool call and query Gemini fallback', async () => {
      // Mock generateContentStream to return exactly 1 tool call: ask_general_knowledge
      mockGoogleGenAI.models = {
        generateContentStream: jest.fn().mockImplementation(() =>
          (async function* () {
            yield { functionCalls: [{ name: 'ask_general_knowledge', args: { query: 'test query' } }] };
          })()
        ),
        generateContent: jest.fn().mockResolvedValue({
          text: 'Google Search Weather Result',
        }),
      };

      // Ensure MCP is NOT called for this pseudo-tool
      mockMcpClient.callTool = jest.fn();

      await service.chatStream(mockRes, 'Weather', []);

      // It should call the secondary search agent using generateContent
      expect(mockGoogleGenAI.models.generateContent).toHaveBeenCalledWith(
        expect.objectContaining({
          contents: 'test query',
        })
      );

      // MCP should NOT be called
      expect(mockMcpClient.callTool).not.toHaveBeenCalled();

      // Output should be written
      expect(mockRes.write).toHaveBeenCalledWith(expect.stringContaining('Google Search Weather Result'));
      expect(mockRes.end).toHaveBeenCalledTimes(1);
    });

    it('should return too many steps fallback if MAX_ROUNDS is exhausted', async () => {
      // Mock generateContentStream to continually return a tool call every round, reaching 5 rounds
      mockGoogleGenAI.models = {
        generateContentStream: jest.fn().mockImplementation(() =>
          (async function* () {
            yield { functionCalls: [{ name: 'get_users', args: {} }] };
          })()
        ),
      };

      mockMcpClient.callTool = jest.fn().mockResolvedValue({ content: [{ text: 'Dummy' }] });

      await service.chatStream(mockRes, 'Loop forever', []);

      expect(mockRes.write).toHaveBeenCalledWith(
        expect.stringContaining('Xin lỗi, tôi đã thực hiện quá nhiều bước. Vui lòng thử lại.')
      );
      expect(mockGoogleGenAI.models.generateContentStream).toHaveBeenCalledTimes(5);
      expect(mockRes.end).toHaveBeenCalledTimes(1);
    });

    it('should emit error event if a fatal error occurs during streaming', async () => {
      mockGoogleGenAI.models = {
        generateContentStream: jest.fn().mockResolvedValue(
          // eslint-disable-next-line require-yield
          (async function* () {
            throw new Error('Fatal Stream Crash');
          })(),
        ),
      };

      await service.chatStream(mockRes, 'Crash', []);

      expect(mockRes.write).toHaveBeenCalledWith(
        expect.stringContaining('event: error\ndata: {"message":"Fatal Stream Crash"}')
      );
      expect(mockRes.end).toHaveBeenCalledTimes(1);
    });
  });
});
