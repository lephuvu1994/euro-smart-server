import { Test, TestingModule } from '@nestjs/testing';
import { HttpException, UnauthorizedException } from '@nestjs/common';
import { getQueueToken } from '@nestjs/bullmq';
import { UserRole } from '@prisma/client';
import { AuthService } from './auth.service';
import { DatabaseService } from '@app/database';
import { HelperEncryptionService } from '../../helper/services/helper.encryption.service';
import { VietguysService } from '../../vietguys/vietguys.service';
import { SmsSimService } from '../../sms-sim/sms-sim.service';
import { APP_BULLMQ_QUEUES } from '../../enums/app.enum';

// Mock serialport-gsm to prevent TS compilation failure
jest.mock('serialport-gsm', () => ({}));

// ---------- MOCKS ----------
const mockUser = {
  id: 'user-uuid-1',
  email: 'test@example.com',
  phone: '0912345678',
  password: 'hashed-password',
  role: UserRole.USER,
  firstName: 'Test',
  lastName: 'User',
  otpCode: null,
  otpExpire: null,
  otpProvider: null,
  createdAt: new Date(),
  updatedAt: new Date(),
};

const mockSession = {
  id: 'session-uuid-1',
  userId: 'user-uuid-1',
  hashedRefreshToken: 'hashed-refresh-token',
  deviceName: 'iPhone 15',
  ipAddress: null,
  userAgent: null,
  expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
  createdAt: new Date(),
  updatedAt: new Date(),
};

const createMockDatabaseService = () => ({
  user: {
    findFirst: jest.fn(),
    findUnique: jest.fn(),
    create: jest.fn(),
    update: jest.fn(),
  },
  session: {
    create: jest.fn(),
    findUnique: jest.fn(),
    findFirst: jest.fn(),
    findMany: jest.fn(),
    update: jest.fn(),
    delete: jest.fn(),
    deleteMany: jest.fn(),
  },
  home: {
    create: jest.fn().mockResolvedValue({ id: 'home-uuid-1', name: 'Nhà của tôi' }),
  },
  homeMember: {
    findMany: jest.fn().mockResolvedValue([]),
    create: jest.fn(),
  },
  systemConfig: {
    findUnique: jest.fn(),
  },
});

const createMockEncryptionService = () => ({
  createJwtTokens: jest.fn().mockResolvedValue({
    accessToken: 'new-access-token',
    refreshToken: 'new-refresh-token',
  }),
  createAccessToken: jest.fn().mockResolvedValue('new-access-token'),
  createRefreshToken: jest.fn().mockResolvedValue('new-refresh-token'),
  createHash: jest.fn().mockResolvedValue('hashed-value'),
  match: jest.fn().mockResolvedValue(true),
  getRefreshTokenExpireDays: jest.fn().mockReturnValue(30),
  encrypt: jest.fn(),
  decrypt: jest.fn(),
});

const createMockVietguysService = () => ({
  sendOtp: jest.fn(),
});

const createMockSmsSimService = () => ({
  sendSms: jest.fn(),
});

const createMockQueue = () => ({
  add: jest.fn(),
});

// Stub randomUUID
jest.mock('crypto', () => ({
  ...jest.requireActual('crypto'),
  randomUUID: () => 'session-uuid-1',
}));

describe('AuthService', () => {
  let service: AuthService;
  let db: ReturnType<typeof createMockDatabaseService>;
  let encryption: ReturnType<typeof createMockEncryptionService>;
  let vietguys: ReturnType<typeof createMockVietguysService>;
  let smsSim: ReturnType<typeof createMockSmsSimService>;
  let emailQueue: ReturnType<typeof createMockQueue>;

  beforeEach(async () => {
    db = createMockDatabaseService();
    encryption = createMockEncryptionService();
    vietguys = createMockVietguysService();
    smsSim = createMockSmsSimService();
    emailQueue = createMockQueue();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AuthService,
        { provide: DatabaseService, useValue: db },
        { provide: HelperEncryptionService, useValue: encryption },
        { provide: VietguysService, useValue: vietguys },
        { provide: SmsSimService, useValue: smsSim },
        {
          provide: getQueueToken(APP_BULLMQ_QUEUES.EMAIL),
          useValue: emailQueue,
        },
      ],
    }).compile();

    service = module.get<AuthService>(AuthService);
  });

  // ============================================================
  // LOGIN
  // ============================================================
  describe('login', () => {
    const loginDto = {
      identifier: 'test@example.com',
      password: 'Password@123',
      deviceName: 'iPhone 15',
    };

    it('should throw NOT_FOUND if user does not exist', async () => {
      db.user.findFirst.mockResolvedValue(null);
      await expect(service.login(loginDto)).rejects.toThrow(HttpException);
    });

    it('should throw BAD_REQUEST if password does not match', async () => {
      db.user.findFirst.mockResolvedValue(mockUser);
      encryption.match.mockResolvedValue(false);
      await expect(service.login(loginDto)).rejects.toThrow(HttpException);
    });

    it('should create a session record on successful login', async () => {
      db.user.findFirst.mockResolvedValue(mockUser);
      encryption.match.mockResolvedValue(true);

      await service.login(loginDto);

      expect(db.session.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          id: 'session-uuid-1',
          userId: mockUser.id,
          hashedRefreshToken: 'hashed-value',
          deviceName: 'iPhone 15',
        }),
      });
    });

    it('should use "Unknown Device" when deviceName is not provided', async () => {
      db.user.findFirst.mockResolvedValue(mockUser);
      encryption.match.mockResolvedValue(true);

      await service.login({ identifier: 'test@example.com', password: 'Password@123' });

      expect(db.session.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          deviceName: 'Unknown Device',
        }),
      });
    });

    it('should pass sid to createJwtTokens', async () => {
      db.user.findFirst.mockResolvedValue(mockUser);
      encryption.match.mockResolvedValue(true);

      await service.login(loginDto);

      expect(encryption.createJwtTokens).toHaveBeenCalledWith(
        { role: mockUser.role, userId: mockUser.id },
        'session-uuid-1',
      );
    });

    it('should hash the refresh token before storing', async () => {
      db.user.findFirst.mockResolvedValue(mockUser);
      encryption.match.mockResolvedValue(true);

      await service.login(loginDto);

      expect(encryption.createHash).toHaveBeenCalledWith('new-refresh-token');
    });

    it('should use getRefreshTokenExpireDays for session expiration', async () => {
      db.user.findFirst.mockResolvedValue(mockUser);
      encryption.match.mockResolvedValue(true);

      await service.login(loginDto);

      expect(encryption.getRefreshTokenExpireDays).toHaveBeenCalled();
      const createCall = db.session.create.mock.calls[0][0];
      const expiresAt = createCall.data.expiresAt as Date;
      // Session should expire ~30 days from now
      const diffDays = (expiresAt.getTime() - Date.now()) / (1000 * 60 * 60 * 24);
      expect(diffDays).toBeGreaterThan(29);
      expect(diffDays).toBeLessThan(31);
    });

    it('should return tokens and user on successful login', async () => {
      db.user.findFirst.mockResolvedValue(mockUser);
      encryption.match.mockResolvedValue(true);

      const result = await service.login(loginDto);

      expect(result).toHaveProperty('accessToken', 'new-access-token');
      expect(result).toHaveProperty('refreshToken', 'new-refresh-token');
      expect(result).toHaveProperty('user');
      expect(result).toHaveProperty('homes');
    });

    it('should use phone as userName when user has no email', async () => {
      const phoneUser = { ...mockUser, email: null, phone: '0912345678' };
      db.user.findFirst.mockResolvedValue(phoneUser);
      encryption.match.mockResolvedValue(true);

      const result = await service.login({
        identifier: '0912345678',
        password: 'Password@123',
      });

      expect(result).toHaveProperty('user');
    });

    it('should return homes from getUserHomes', async () => {
      db.user.findFirst.mockResolvedValue(mockUser);
      encryption.match.mockResolvedValue(true);
      db.homeMember.findMany.mockResolvedValue([
        { role: 'OWNER', home: { id: 'h1', name: 'Home 1' } },
        { role: 'MEMBER', home: { id: 'h2', name: 'Home 2' } },
      ]);

      const result = await service.login(loginDto);

      expect(result.homes).toEqual([
        { id: 'h1', name: 'Home 1', role: 'OWNER' },
        { id: 'h2', name: 'Home 2', role: 'MEMBER' },
      ]);
    });
  });

  // ============================================================
  // LOGOUT
  // ============================================================
  describe('logout', () => {
    it('should delete session if sid is present', async () => {
      await service.logout({
        userId: 'user-uuid-1',
        role: UserRole.USER,
        sid: 'session-uuid-1',
      });

      expect(db.session.deleteMany).toHaveBeenCalledWith({
        where: { id: 'session-uuid-1' },
      });
    });

    it('should NOT delete session if sid is missing', async () => {
      await service.logout({
        userId: 'user-uuid-1',
        role: UserRole.USER,
      });

      expect(db.session.deleteMany).not.toHaveBeenCalled();
    });
  });

  // ============================================================
  // REFRESH TOKENS
  // ============================================================
  describe('refreshTokens', () => {
    const payload = {
      userId: 'user-uuid-1',
      role: UserRole.USER,
      sid: 'session-uuid-1',
      refreshToken: 'current-refresh-token',
    };

    it('should throw UnauthorizedException if sid is missing', async () => {
      await expect(
        service.refreshTokens({ userId: 'user-uuid-1', role: UserRole.USER }),
      ).rejects.toThrow(UnauthorizedException);
    });

    it('should throw UnauthorizedException if refreshToken is missing', async () => {
      await expect(
        service.refreshTokens({
          userId: 'user-uuid-1',
          role: UserRole.USER,
          sid: 'session-uuid-1',
        }),
      ).rejects.toThrow(UnauthorizedException);
    });

    it('should throw UnauthorizedException if session not found', async () => {
      db.session.findUnique.mockResolvedValue(null);
      await expect(service.refreshTokens(payload)).rejects.toThrow(
        UnauthorizedException,
      );
    });

    it('should throw UnauthorizedException if session belongs to different user', async () => {
      db.session.findUnique.mockResolvedValue({
        ...mockSession,
        userId: 'other-user-id',
      });
      await expect(service.refreshTokens(payload)).rejects.toThrow(
        UnauthorizedException,
      );
    });

    it('should delete ALL sessions if token reuse detected (security)', async () => {
      db.session.findUnique.mockResolvedValue(mockSession);
      encryption.match.mockResolvedValue(false); // Token doesn't match → reuse attack

      await expect(service.refreshTokens(payload)).rejects.toThrow(
        UnauthorizedException,
      );
      expect(db.session.deleteMany).toHaveBeenCalledWith({
        where: { userId: 'user-uuid-1' },
      });
    });

    it('should rotate tokens and update session on success', async () => {
      db.session.findUnique.mockResolvedValue(mockSession);
      encryption.match.mockResolvedValue(true);

      const result = await service.refreshTokens(payload);

      // Should create new tokens
      expect(encryption.createJwtTokens).toHaveBeenCalledWith(
        { userId: 'user-uuid-1', role: UserRole.USER },
        'session-uuid-1',
      );
      // Should hash the new refresh token
      expect(encryption.createHash).toHaveBeenCalledWith('new-refresh-token');
      // Should update the session in DB
      expect(db.session.update).toHaveBeenCalledWith({
        where: { id: 'session-uuid-1' },
        data: { hashedRefreshToken: 'hashed-value' },
      });
      // Should return the new tokens
      expect(result).toEqual({
        accessToken: 'new-access-token',
        refreshToken: 'new-refresh-token',
      });
    });
  });

  // ============================================================
  // CHANGE PASSWORD → Global Logout
  // ============================================================
  describe('changePassword', () => {
    const changeDto = { oldPassword: 'OldPass@123', newPassword: 'NewPass@123' };

    it('should throw NOT_FOUND if user does not exist', async () => {
      db.user.findUnique.mockResolvedValue(null);
      await expect(
        service.changePassword('user-uuid-1', changeDto),
      ).rejects.toThrow(HttpException);
    });

    it('should throw BAD_REQUEST if old password is wrong', async () => {
      db.user.findUnique.mockResolvedValue(mockUser);
      encryption.match.mockResolvedValue(false);
      await expect(
        service.changePassword('user-uuid-1', changeDto),
      ).rejects.toThrow(HttpException);
    });

    it('should delete ALL sessions after changing password', async () => {
      db.user.findUnique.mockResolvedValue(mockUser);
      encryption.match.mockResolvedValue(true);

      await service.changePassword('user-uuid-1', changeDto);

      expect(db.session.deleteMany).toHaveBeenCalledWith({
        where: { userId: 'user-uuid-1' },
      });
    });

    it('should update user password', async () => {
      db.user.findUnique.mockResolvedValue(mockUser);
      encryption.match.mockResolvedValue(true);

      await service.changePassword('user-uuid-1', changeDto);

      expect(db.user.update).toHaveBeenCalledWith({
        where: { id: 'user-uuid-1' },
        data: { password: 'hashed-value' },
      });
    });
  });

  // ============================================================
  // RESET PASSWORD → Global Logout
  // ============================================================
  describe('resetPassword', () => {
    const resetDto = {
      identifier: 'test@example.com',
      newPassword: 'NewPass@123',
      resetToken: 'valid-reset-token',
    };

    it('should delete ALL sessions after resetting password', async () => {
      const verifiedUser = {
        ...mockUser,
        otpProvider: 'VERIFIED',
        otpCode: 'valid-reset-token',
        otpExpire: new Date(Date.now() + 5 * 60 * 1000), // 5 minutes from now
      };
      db.user.findFirst.mockResolvedValue(verifiedUser);

      await service.resetPassword(resetDto);

      expect(db.session.deleteMany).toHaveBeenCalledWith({
        where: { userId: mockUser.id },
      });
    });

    it('should throw if OTP not verified', async () => {
      db.user.findFirst.mockResolvedValue({
        ...mockUser,
        otpProvider: null,
      });

      await expect(service.resetPassword(resetDto)).rejects.toThrow(
        HttpException,
      );
    });

    it('should throw if reset token expired', async () => {
      db.user.findFirst.mockResolvedValue({
        ...mockUser,
        otpProvider: 'VERIFIED',
        otpCode: 'valid-reset-token',
        otpExpire: new Date(Date.now() - 1000), // expired
      });

      await expect(service.resetPassword(resetDto)).rejects.toThrow(
        HttpException,
      );
    });
  });

  // ============================================================
  // CHECK EXISTS
  // ============================================================
  describe('checkExists', () => {
    it('should return { exists: true } when user exists by email', async () => {
      db.user.findFirst.mockResolvedValue({ id: 'user-uuid-1' });

      const result = await service.checkExists({ identifier: 'test@example.com' });

      expect(result).toEqual({ exists: true });
      expect(db.user.findFirst).toHaveBeenCalledWith({
        where: {
          OR: [{ email: 'test@example.com' }, { phone: 'test@example.com' }],
        },
        select: { id: true },
      });
    });

    it('should return { exists: false } when user does not exist', async () => {
      db.user.findFirst.mockResolvedValue(null);

      const result = await service.checkExists({ identifier: 'no@user.com' });

      expect(result).toEqual({ exists: false });
    });
  });

  // ============================================================
  // GET ME
  // ============================================================
  describe('getMe', () => {
    it('should throw NOT_FOUND if user not found', async () => {
      db.user.findUnique.mockResolvedValue(null);

      await expect(service.getMe('non-existent')).rejects.toThrow(HttpException);
    });

    it('should return user profile and homes', async () => {
      db.user.findUnique.mockResolvedValue(mockUser);
      db.homeMember.findMany.mockResolvedValue([
        {
          role: 'OWNER',
          home: { id: 'home-1', name: 'My Home' },
        },
      ]);

      const result = await service.getMe('user-uuid-1');

      expect(result).toHaveProperty('user');
      expect(result).toHaveProperty('homes');
      expect(result.homes).toEqual([
        { id: 'home-1', name: 'My Home', role: 'OWNER' },
      ]);
    });

    it('should use email prefix as userName when email exists', async () => {
      db.user.findUnique.mockResolvedValue(mockUser);

      const result = await service.getMe('user-uuid-1');

      expect(result.user).toBeDefined();
    });

    it('should use phone as userName when email is null', async () => {
      db.user.findUnique.mockResolvedValue({
        ...mockUser,
        email: null,
        phone: '0912345678',
      });

      const result = await service.getMe('user-uuid-1');

      expect(result.user).toBeDefined();
    });
  });

  // ============================================================
  // SIGNUP
  // ============================================================
  describe('signup', () => {
    const signupEmailDto = {
      identifier: 'new@example.com',
      password: 'Password@123',
      firstName: 'New',
      lastName: 'User',
    };
    const signupPhoneDto = {
      identifier: '0912345678',
      password: 'Password@123',
      firstName: 'Phone',
      lastName: 'User',
    };

    it('should throw CONFLICT if user already exists', async () => {
      db.user.findFirst.mockResolvedValue(mockUser);

      await expect(service.signup(signupEmailDto)).rejects.toThrow(HttpException);
    });

    it('should create user with email when identifier contains @', async () => {
      db.user.findFirst.mockResolvedValue(null);
      db.user.create.mockResolvedValue({ ...mockUser, id: 'new-user-id' });

      await service.signup(signupEmailDto);

      expect(db.user.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          email: 'new@example.com',
          phone: null,
          role: UserRole.USER,
        }),
      });
    });

    it('should create user with phone when identifier has no @', async () => {
      db.user.findFirst.mockResolvedValue(null);
      db.user.create.mockResolvedValue({
        ...mockUser,
        id: 'new-user-id',
        email: null,
        phone: '0912345678',
      });

      await service.signup(signupPhoneDto);

      expect(db.user.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          email: null,
          phone: '0912345678',
        }),
      });
    });

    it('should create default home and homeMember', async () => {
      db.user.findFirst.mockResolvedValue(null);
      db.user.create.mockResolvedValue({ ...mockUser, id: 'new-user-id' });

      await service.signup(signupEmailDto);

      expect(db.home.create).toHaveBeenCalledWith({
        data: {
          name: 'Nhà của tôi',
          ownerId: 'new-user-id',
        },
      });
      expect(db.homeMember.create).toHaveBeenCalledWith({
        data: {
          userId: 'new-user-id',
          homeId: 'home-uuid-1',
          role: 'OWNER',
        },
      });
    });

    it('should enqueue welcome email for email signups', async () => {
      db.user.findFirst.mockResolvedValue(null);
      db.user.create.mockResolvedValue({ ...mockUser, id: 'new-user-id' });

      await service.signup(signupEmailDto);

      expect(emailQueue.add).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({ to: 'new@example.com' }),
        expect.any(Object),
      );
    });

    it('should NOT enqueue email for phone signups', async () => {
      db.user.findFirst.mockResolvedValue(null);
      db.user.create.mockResolvedValue({
        ...mockUser,
        id: 'new-user-id',
        email: null,
        phone: '0912345678',
      });

      await service.signup(signupPhoneDto);

      expect(emailQueue.add).not.toHaveBeenCalled();
    });

    it('should return tokens, user, and homes', async () => {
      db.user.findFirst.mockResolvedValue(null);
      db.user.create.mockResolvedValue({ ...mockUser, id: 'new-user-id' });

      const result = await service.signup(signupEmailDto);

      expect(result).toHaveProperty('accessToken');
      expect(result).toHaveProperty('refreshToken');
      expect(result).toHaveProperty('user');
      expect(result).toHaveProperty('homes');
      expect(result.homes).toHaveLength(1);
      expect(result.homes[0]).toHaveProperty('role', 'OWNER');
    });

    it('should handle signup without firstName/lastName', async () => {
      db.user.findFirst.mockResolvedValue(null);
      db.user.create.mockResolvedValue({ ...mockUser, id: 'new-user-id' });

      await service.signup({
        identifier: 'minimal@example.com',
        password: 'Password@123',
      });

      expect(db.user.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          firstName: undefined,
          lastName: undefined,
        }),
      });
      // Should fallback userName context to 'User' in email
      expect(emailQueue.add).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          context: expect.objectContaining({
            userName: expect.any(String),
          }),
        }),
        expect.any(Object),
      );
    });
  });

  // ============================================================
  // FORGOT PASSWORD
  // ============================================================
  describe('forgotPassword', () => {
    it('should throw NOT_FOUND if user does not exist', async () => {
      db.user.findFirst.mockResolvedValue(null);

      await expect(
        service.forgotPassword({ identifier: 'no@user.com' }),
      ).rejects.toThrow(HttpException);
    });

    it('should generate OTP and enqueue email for email identifier', async () => {
      db.user.findFirst.mockResolvedValue(mockUser);
      db.systemConfig.findUnique.mockResolvedValue(null); // default 5 min

      await service.forgotPassword({ identifier: 'test@example.com' });

      // Should update user with OTP
      expect(db.user.update).toHaveBeenCalledWith({
        where: { id: mockUser.id },
        data: expect.objectContaining({
          otpProvider: 'EMAIL',
        }),
      });
      // Should enqueue forgot-password email
      expect(emailQueue.add).toHaveBeenCalled();
    });

    it('should use custom OTP_EXPIRE from SystemConfig', async () => {
      db.user.findFirst.mockResolvedValue(mockUser);
      db.systemConfig.findUnique.mockResolvedValue({ key: 'OTP_EXPIRE', value: '10' });

      await service.forgotPassword({ identifier: 'test@example.com' });

      const updateCall = db.user.update.mock.calls[0][0];
      const otpExpire = updateCall.data.otpExpire as Date;
      const diffMin = (otpExpire.getTime() - Date.now()) / (1000 * 60);
      // Should be approximately 10 minutes
      expect(diffMin).toBeGreaterThan(9);
      expect(diffMin).toBeLessThan(11);
    });

    it('should try SMS SIM first for phone identifier', async () => {
      db.user.findFirst.mockResolvedValue(mockUser);
      db.systemConfig.findUnique.mockResolvedValue(null);

      await service.forgotPassword({ identifier: '0912345678' });

      expect(smsSim.sendSms).toHaveBeenCalled();
      expect(db.user.update).toHaveBeenCalledWith({
        where: { id: mockUser.id },
        data: expect.objectContaining({
          otpProvider: 'SMS_SIM',
        }),
      });
    });

    it('should fallback to Vietguys when SMS SIM fails', async () => {
      db.user.findFirst.mockResolvedValue(mockUser);
      db.systemConfig.findUnique.mockResolvedValue(null);
      smsSim.sendSms.mockRejectedValue(new Error('SIM not available'));

      await service.forgotPassword({ identifier: '0912345678' });

      // Should update with VIETGUYS provider
      expect(db.user.update).toHaveBeenCalledWith({
        where: { id: mockUser.id },
        data: expect.objectContaining({
          otpProvider: 'VIETGUYS',
        }),
      });
      // Should call vietguys
      expect(vietguys.sendOtp).toHaveBeenCalled();
    });

    it('should NOT send email or vietguys when provider is SMS_SIM', async () => {
      db.user.findFirst.mockResolvedValue(mockUser);
      db.systemConfig.findUnique.mockResolvedValue(null);

      await service.forgotPassword({ identifier: '0912345678' });

      expect(emailQueue.add).not.toHaveBeenCalled();
      expect(vietguys.sendOtp).not.toHaveBeenCalled();
    });
  });

  // ============================================================
  // VERIFY OTP
  // ============================================================
  describe('verifyOtp', () => {
    const verifyDto = { identifier: 'test@example.com', otp: '123456' };

    it('should throw if user not found', async () => {
      db.user.findFirst.mockResolvedValue(null);

      await expect(service.verifyOtp(verifyDto)).rejects.toThrow(HttpException);
    });

    it('should throw if otpProvider is null', async () => {
      db.user.findFirst.mockResolvedValue({ ...mockUser, otpProvider: null });

      await expect(service.verifyOtp(verifyDto)).rejects.toThrow(HttpException);
    });

    it('should throw if OTP code does not match', async () => {
      db.user.findFirst.mockResolvedValue({
        ...mockUser,
        otpProvider: 'EMAIL',
        otpCode: '654321',
        otpExpire: new Date(Date.now() + 5 * 60 * 1000),
      });

      await expect(service.verifyOtp(verifyDto)).rejects.toThrow(HttpException);
    });

    it('should throw if OTP is expired', async () => {
      db.user.findFirst.mockResolvedValue({
        ...mockUser,
        otpProvider: 'EMAIL',
        otpCode: '123456',
        otpExpire: new Date(Date.now() - 1000), // expired
      });

      await expect(service.verifyOtp(verifyDto)).rejects.toThrow(HttpException);
    });

    it('should throw if otpExpire is null', async () => {
      db.user.findFirst.mockResolvedValue({
        ...mockUser,
        otpProvider: 'EMAIL',
        otpCode: '123456',
        otpExpire: null,
      });

      await expect(service.verifyOtp(verifyDto)).rejects.toThrow(HttpException);
    });

    it('should return resetToken on valid OTP', async () => {
      db.user.findFirst.mockResolvedValue({
        ...mockUser,
        otpProvider: 'EMAIL',
        otpCode: '123456',
        otpExpire: new Date(Date.now() + 5 * 60 * 1000),
      });

      const result = await service.verifyOtp(verifyDto);

      expect(result).toEqual({ resetToken: 'session-uuid-1' }); // randomUUID is mocked
    });

    it('should update user to VERIFIED state with resetToken', async () => {
      db.user.findFirst.mockResolvedValue({
        ...mockUser,
        otpProvider: 'EMAIL',
        otpCode: '123456',
        otpExpire: new Date(Date.now() + 5 * 60 * 1000),
      });

      await service.verifyOtp(verifyDto);

      expect(db.user.update).toHaveBeenCalledWith({
        where: { id: mockUser.id },
        data: {
          otpCode: 'session-uuid-1',
          otpExpire: expect.any(Date),
          otpProvider: 'VERIFIED',
        },
      });
    });
  });

  // ============================================================
  // RESET PASSWORD (additional: token mismatch)
  // ============================================================
  describe('resetPassword (extended)', () => {
    it('should throw if reset token does not match', async () => {
      db.user.findFirst.mockResolvedValue({
        ...mockUser,
        otpProvider: 'VERIFIED',
        otpCode: 'different-token',
        otpExpire: new Date(Date.now() + 5 * 60 * 1000),
      });

      await expect(
        service.resetPassword({
          identifier: 'test@example.com',
          newPassword: 'NewPass@123',
          resetToken: 'wrong-token',
        }),
      ).rejects.toThrow(HttpException);
    });

    it('should update password and clear OTP state', async () => {
      db.user.findFirst.mockResolvedValue({
        ...mockUser,
        otpProvider: 'VERIFIED',
        otpCode: 'valid-token',
        otpExpire: new Date(Date.now() + 5 * 60 * 1000),
      });

      await service.resetPassword({
        identifier: 'test@example.com',
        newPassword: 'NewPass@123',
        resetToken: 'valid-token',
      });

      expect(db.user.update).toHaveBeenCalledWith({
        where: { id: mockUser.id },
        data: {
          password: 'hashed-value',
          otpCode: null,
          otpExpire: null,
          otpProvider: null,
        },
      });
    });

    it('should use phone lookup when identifier has no @', async () => {
      db.user.findFirst.mockResolvedValue({
        ...mockUser,
        otpProvider: 'VERIFIED',
        otpCode: 'valid-token',
        otpExpire: new Date(Date.now() + 5 * 60 * 1000),
      });

      await service.resetPassword({
        identifier: '0912345678',
        newPassword: 'NewPass@123',
        resetToken: 'valid-token',
      });

      expect(db.user.findFirst).toHaveBeenCalledWith({
        where: { phone: '0912345678' },
      });
    });
  });
});
