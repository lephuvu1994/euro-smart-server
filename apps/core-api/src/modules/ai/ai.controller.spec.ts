import { Test, TestingModule } from '@nestjs/testing';
import { AiController } from './ai.controller';
import { AiService } from './ai.service';
import { JwtAccessGuard } from '@app/common/request/guards/jwt.access.guard';
import { RolesGuard } from '@app/common/request/guards/roles.guard';

describe('AiController', () => {
  let controller: AiController;
  let service: AiService;

  const mockAiService = {
    chat: jest.fn(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [AiController],
      providers: [
        {
          provide: AiService,
          useValue: mockAiService,
        },
      ],
    })
      .overrideGuard(JwtAccessGuard)
      .useValue({ canActivate: jest.fn(() => true) })
      .overrideGuard(RolesGuard)
      .useValue({ canActivate: jest.fn(() => true) })
      .compile();

    controller = module.get<AiController>(AiController);
    service = module.get<AiService>(AiService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  describe('chat', () => {
    it('should return error if prompt is missing', async () => {
      const result = await controller.chat({ prompt: '' });
      expect(result).toEqual({ error: 'Prompt is required' });
      expect(service.chat).not.toHaveBeenCalled();
    });

    it('should call aiService.chat with default lang "vi" if not provided', async () => {
      mockAiService.chat.mockResolvedValue('Chào bạn');
      const result = await controller.chat({ prompt: 'Xin chào' });
      
      expect(service.chat).toHaveBeenCalledWith('Xin chào', 'vi');
      expect(result).toEqual({ response: 'Chào bạn' });
    });

    it('should call aiService.chat with provided lang', async () => {
      mockAiService.chat.mockResolvedValue('Hello there');
      const result = await controller.chat({ prompt: 'Hello', lang: 'en' });
      
      expect(service.chat).toHaveBeenCalledWith('Hello', 'en');
      expect(result).toEqual({ response: 'Hello there' });
    });
  });
});
