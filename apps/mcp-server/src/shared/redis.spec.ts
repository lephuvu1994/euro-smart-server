const mockRedisConstructor = jest.fn();
jest.mock('ioredis', () => mockRedisConstructor);
jest.mock('bullmq', () => ({
    Queue: jest.fn(),
}));

describe('Shared Redis/BullMQ instances', () => {
    const originalEnv = process.env;

    beforeEach(() => {
        jest.clearAllMocks();
        jest.resetModules();
        process.env = { ...originalEnv };
    });

    afterAll(() => {
        process.env = originalEnv;
    });

    it('should initialize with default ENVs when none are provided', () => {
        delete process.env.REDIS_HOST;
        delete process.env.REDIS_PORT;
        delete process.env.REDIS_USERNAME;
        delete process.env.REDIS_PASSWORD;
        delete process.env.REDIS_ENABLE_TLS;

        const { redis } = require('./redis');
        const { Queue } = require('bullmq');

        expect(mockRedisConstructor).toHaveBeenCalledWith({
            host: 'localhost',
            port: 6379,
            username: 'default',
            password: undefined,
            tls: undefined,
            maxRetriesPerRequest: null,
        });

        expect(Queue).toHaveBeenCalledWith('device_controll', { connection: redis });
    });

    it('should initialize with specific ENVs', () => {
        process.env.REDIS_HOST = 'test-host';
        process.env.REDIS_PORT = '1234';
        process.env.REDIS_USERNAME = 'test-user';
        process.env.REDIS_PASSWORD = 'test-password';
        process.env.REDIS_ENABLE_TLS = 'true';

        require('./redis');

        expect(mockRedisConstructor).toHaveBeenCalledWith({
            host: 'test-host',
            port: 1234,
            username: 'test-user',
            password: 'test-password',
            tls: {},
            maxRetriesPerRequest: null,
        });
    });
});
