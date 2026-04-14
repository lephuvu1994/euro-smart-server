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
    
    // Default environment
    process.env.GEMINI_API_KEY = 'test-key';

    const module: TestingModule = await Test.createTestingModule({
      providers: [AiService],
    }).compile();

    service = module.get<AiService>(AiService);
    
    // Access internal instances created inside constructor
    mockMcpClient = (service as any).mcpClient;
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
      
      const loggerWarnSpy = jest.spyOn(Logger.prototype, 'warn').mockImplementation(() => { /* empty */ });
      
      const testModule = await Test.createTestingModule({
        providers: [AiService],
      }).compile();
      const testService = testModule.get<AiService>(AiService);
      
      expect(loggerWarnSpy).toHaveBeenCalledWith('GEMINI_API_KEY is not set in environment variables! AI Chat will not work.');
      expect(testService).toBeDefined();
    });
  });

  describe('onModuleInit', () => {
    it('should connect to MCP server and refresh tools', async () => {
      mockMcpClient.connect = jest.fn().mockResolvedValue(undefined);
      mockMcpClient.listTools = jest.fn().mockResolvedValue({ tools: [] });
      
      await service.onModuleInit();
      
      expect(SSEClientTransport).toHaveBeenCalledTimes(1);
      expect(mockMcpClient.connect).toHaveBeenCalled();
      expect(mockMcpClient.listTools).toHaveBeenCalled();
    });

    it('should handle connection error gracefully', async () => {
      const loggerErrorSpy = jest.spyOn((service as any).logger, 'error');
      mockMcpClient.connect = jest.fn().mockRejectedValue(new Error('Connection failed'));
      
      await service.onModuleInit();
      
      expect(loggerErrorSpy).toHaveBeenCalledWith('Failed to connect to MCP Server', expect.any(Error));
    });
  });

  describe('onModuleDestroy', () => {
    it('should close the MCP client', async () => {
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
          }
        ],
      });

      await service.onModuleInit();

      const cache = (service as any).geminiToolsCache[0];
      expect(cache.functionDeclarations).toHaveLength(2);
      
      const testToolDecl = cache.functionDeclarations[0];
      expect(testToolDecl.name).toBe('test_tool');
      expect(testToolDecl.parameters.properties.paramString.type).toBe('STRING');
      expect(testToolDecl.parameters.properties.paramNum.type).toBe('NUMBER');
      expect(testToolDecl.parameters.properties.paramInt.type).toBe('INTEGER');
      expect(testToolDecl.parameters.properties.paramBool.type).toBe('BOOLEAN');
      expect(testToolDecl.parameters.properties.paramArr.type).toBe('ARRAY');
      expect(testToolDecl.parameters.properties.paramObj.type).toBe('OBJECT');
      expect(testToolDecl.parameters.properties.paramUnknown.type).toBe('STRING'); // fallback
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
        generateContent: jest.fn()
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
        generateContent: jest.fn()
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
});
