import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { HelperEncryptionService } from './helper.encryption.service';

describe('HelperEncryptionService', () => {
  const mockConfigValues: Record<string, string> = {
    'auth.accessToken.secret': 'access-secret',
    'auth.refreshToken.secret': 'refresh-secret',
    'auth.accessToken.tokenExp': '15m',
    'auth.refreshToken.tokenExp': '30d',
  };

  const createService = async (overrideConfig?: Record<string, string>) => {
    const config = { ...mockConfigValues, ...overrideConfig };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        HelperEncryptionService,
        {
          provide: ConfigService,
          useValue: {
            getOrThrow: jest.fn((key: string) => {
              if (config[key] === undefined)
                throw new Error(`Config key "${key}" not found`);
              return config[key];
            }),
          },
        },
        {
          provide: JwtService,
          useValue: {
            signAsync: jest.fn().mockResolvedValue('mock-jwt-token'),
          },
        },
      ],
    }).compile();

    return {
      service: module.get<HelperEncryptionService>(HelperEncryptionService),
      jwtService: module.get<JwtService>(JwtService),
    };
  };

  // ============================================================
  // getRefreshTokenExpireDays
  // ============================================================
  describe('getRefreshTokenExpireDays', () => {
    it('should parse "30d" as 30 days', async () => {
      const { service } = await createService({
        'auth.refreshToken.tokenExp': '30d',
      });
      expect(service.getRefreshTokenExpireDays()).toBe(30);
    });

    it('should parse "7d" as 7 days', async () => {
      const { service } = await createService({
        'auth.refreshToken.tokenExp': '7d',
      });
      expect(service.getRefreshTokenExpireDays()).toBe(7);
    });

    it('should parse "24h" as 1 day', async () => {
      const { service } = await createService({
        'auth.refreshToken.tokenExp': '24h',
      });
      expect(service.getRefreshTokenExpireDays()).toBe(1);
    });

    it('should parse "48h" as 2 days', async () => {
      const { service } = await createService({
        'auth.refreshToken.tokenExp': '48h',
      });
      expect(service.getRefreshTokenExpireDays()).toBe(2);
    });

    it('should parse "86400s" as 1 day', async () => {
      const { service } = await createService({
        'auth.refreshToken.tokenExp': '86400s',
      });
      expect(service.getRefreshTokenExpireDays()).toBe(1);
    });

    it('should parse "1440m" as 1 day', async () => {
      const { service } = await createService({
        'auth.refreshToken.tokenExp': '1440m',
      });
      expect(service.getRefreshTokenExpireDays()).toBe(1);
    });

    it('should default to 7 days for invalid format', async () => {
      const { service } = await createService({
        'auth.refreshToken.tokenExp': 'invalid',
      });
      expect(service.getRefreshTokenExpireDays()).toBe(7);
    });

    it('should treat bare number (no unit suffix) as days', async () => {
      const { service } = await createService({
        'auth.refreshToken.tokenExp': '14',
      });
      expect(service.getRefreshTokenExpireDays()).toBe(14);
    });
  });

  // ============================================================
  // createJwtTokens — sid propagation
  // ============================================================
  describe('createJwtTokens', () => {
    it('should pass sid into both access and refresh tokens', async () => {
      const { service, jwtService } = await createService();
      const payload = { userId: 'user-1', role: 'USER' as any };

      await service.createJwtTokens(payload, 'my-session-id');

      // Both calls should include sid in the payload
      const signCalls = (jwtService.signAsync as jest.Mock).mock.calls;
      expect(signCalls).toHaveLength(2);

      // AccessToken: should contain sid
      const accessTokenPayload = signCalls.find(
        (call: any[]) => call[1]?.secret === 'access-secret',
      );
      expect(accessTokenPayload?.[0]).toHaveProperty('sid', 'my-session-id');

      // RefreshToken: should contain sid
      const refreshTokenPayload = signCalls.find(
        (call: any[]) => call[1]?.secret === 'refresh-secret',
      );
      expect(refreshTokenPayload?.[0]).toHaveProperty('sid', 'my-session-id');
    });

    it('should NOT include sid if not provided', async () => {
      const { service, jwtService } = await createService();
      const payload = { userId: 'user-1', role: 'USER' as any };

      await service.createJwtTokens(payload);

      const signCalls = (jwtService.signAsync as jest.Mock).mock.calls;
      // Neither call should have sid
      signCalls.forEach((call: any[]) => {
        expect(call[0]).not.toHaveProperty('sid');
      });
    });
  });

  // ============================================================
  // createAccessToken — sid in access token
  // ============================================================
  describe('createAccessToken', () => {
    it('should include sid in payload when provided', async () => {
      const { service, jwtService } = await createService();
      const payload = { userId: 'user-1', role: 'USER' as any };

      await service.createAccessToken(payload, 'session-123');

      expect(jwtService.signAsync).toHaveBeenCalledWith(
        expect.objectContaining({ userId: 'user-1', sid: 'session-123' }),
        expect.objectContaining({ secret: 'access-secret' }),
      );
    });

    it('should NOT include sid when not provided', async () => {
      const { service, jwtService } = await createService();
      const payload = { userId: 'user-1', role: 'USER' as any };

      await service.createAccessToken(payload);

      const call = (jwtService.signAsync as jest.Mock).mock.calls[0];
      expect(call[0]).not.toHaveProperty('sid');
    });
  });

  // ============================================================
  // createHash and match 
  // ============================================================
  describe('createHash and match', () => {
    it('should hash and verify a password', async () => {
      const { service } = await createService();

      const hash = await service.createHash('test-password');
      expect(hash).toBeDefined();
      expect(typeof hash).toBe('string');

      const result = await service.match(hash, 'test-password');
      expect(result).toBe(true);

      const wrongResult = await service.match(hash, 'wrong-password');
      expect(wrongResult).toBe(false);
    });
  });

  // ============================================================
  // encrypt and decrypt
  // ============================================================
  describe('encrypt and decrypt', () => {
    it('should round-trip encrypt/decrypt', async () => {
      const { service } = await createService();
      const plaintext = 'Hello, World!';

      const encrypted = await service.encrypt(plaintext);
      expect(encrypted).toHaveProperty('iv');
      expect(encrypted).toHaveProperty('data');
      expect(encrypted).toHaveProperty('tag');
      expect(encrypted).toHaveProperty('salt');

      const decrypted = await service.decrypt(encrypted);
      expect(decrypted).toBe(plaintext);
    });
  });
});
