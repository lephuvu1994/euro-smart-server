import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { registerDeviceControlTools } from './device-control.tools';
import prisma from '../prisma';
import { redis, deviceQueue } from '../shared/redis';

jest.mock('../prisma', () => ({
    __esModule: true,
    default: {
        device: {
            findFirst: jest.fn(),
        },
    },
}));

jest.mock('../shared/redis', () => ({
    redis: {
        get: jest.fn(),
        hgetall: jest.fn(),
    },
    deviceQueue: {
        add: jest.fn(),
    },
}));

describe('Device Control Tools', () => {
    let mockServer: jest.Mocked<McpServer>;
    let registeredTools: Map<string, Function> = new Map();

    beforeEach(() => {
        jest.clearAllMocks();
        registeredTools.clear();
        mockServer = {
            tool: jest.fn().mockImplementation((name, desc, shape, handler) => {
                registeredTools.set(name, handler);
            }),
        } as any;
        registerDeviceControlTools(mockServer);
    });

    const callTool = async (name: string, args: any) => {
        const handler = registeredTools.get(name);
        if (!handler) throw new Error(`Tool ${name} not found`);
        return handler(args);
    };

    const assertError = (result: any, match: string) => {
        expect(result.content[0].type).toBe('text');
        const parsed = JSON.parse(result.content[0].text);
        expect(parsed.error).toContain(match);
    };

    const assertSuccess = (result: any, matchFn: (data: any) => void) => {
        expect(result.content[0].type).toBe('text');
        const parsed = JSON.parse(result.content[0].text);
        matchFn(parsed);
    };

    describe('get_device_status', () => {
        it('should return error if device not found (user context)', async () => {
            (prisma.device.findFirst as jest.Mock).mockResolvedValue(null);
            const res = await callTool('get_device_status', { deviceToken: 'abc', userId: 'usr1' });
            assertError(res, 'bạn không có quyền');
        });

        it('should return error if device not found (admin context)', async () => {
            (prisma.device.findFirst as jest.Mock).mockResolvedValue(null);
            const res = await callTool('get_device_status', { deviceToken: 'abc' });
            assertError(res, 'Thiết bị không tồn tại.');
        });

        it('should return status from Redis successfully', async () => {
            (prisma.device.findFirst as jest.Mock).mockResolvedValue({ token: 't1', name: 'Dev 1' });
            (redis.get as jest.Mock).mockResolvedValue('online');
            (redis.hgetall as jest.Mock).mockResolvedValue({ power: 'ON' });

            const res = await callTool('get_device_status', { deviceToken: 't1' });
            assertSuccess(res, (data) => {
                expect(data.status).toBe('online');
                expect(data.currentValues).toEqual({ power: 'ON' });
            });
        });

        it('should handle Redis returning null values gracefully', async () => {
            (prisma.device.findFirst as jest.Mock).mockResolvedValue({ token: 't1', name: 'Dev 2' });
            (redis.get as jest.Mock).mockResolvedValue('offline');
            (redis.hgetall as jest.Mock).mockResolvedValue(null);

            const res = await callTool('get_device_status', { deviceToken: 't1' });
            assertSuccess(res, (data) => {
                expect(data.status).toBe('offline');
                expect(data.currentValues).toBe('Chưa có dữ liệu trạng thái');
            });
        });

        it('should return error if Redis throws', async () => {
            (prisma.device.findFirst as jest.Mock).mockResolvedValue({ token: 't1', name: 'Dev 1' });
            (redis.get as jest.Mock).mockRejectedValue(new Error('Redis crash'));

            const res = await callTool('get_device_status', { deviceToken: 't1' });
            assertError(res, 'Lỗi kết nối Redis: Error: Redis crash');
        });
    });

    describe('get_device_detail', () => {
        it('should return matching device with UUID in query', async () => {
            (prisma.device.findFirst as jest.Mock).mockResolvedValue({
                id: '12345678-1234-1234-1234-123456789012',
                token: 'tk1',
                name: 'Device UI',
                entities: [
                    { code: 'e1', name: 'Ent', domain: 'curtain', readOnly: false },
                    { code: 'e2', name: 'Ent 2', domain: 'sensor', readOnly: true },
                ],
            });

            const res = await callTool('get_device_detail', { deviceToken: '12345678-1234-1234-1234-123456789012' });
            assertSuccess(res, (data) => {
                expect(data.id).toBe('12345678-1234-1234-1234-123456789012');
                expect(data.entities).toHaveLength(2);
                // Checking domain ValidHints mapping
                expect(data.entities[0].hint).toContain('OPEN'); // curtain
                expect(data.entities[1].hint).toContain('Read-only'); // readOnly
            });
        });

        it('should ensure all domain valid hints are covered', async () => {
            (prisma.device.findFirst as jest.Mock).mockResolvedValue({
                id: '1', token: '1', name: 'D1',
                entities: [
                    { code: 'c1', domain: 'lock', readOnly: false },
                    { code: 'c2', domain: 'switch', readOnly: false },
                    { code: 'c3', domain: 'button', readOnly: false },
                    { code: 'c4', domain: 'climate', readOnly: false },
                    { code: 'c5', domain: 'fan', readOnly: false },
                    { code: 'c6', domain: 'unknown', readOnly: false },
                ]
            });

            const res = await callTool('get_device_detail', { deviceToken: 'valid-token' });
            assertSuccess(res, (data) => {
                const hints = data.entities.map((e: any) => e.hint);
                expect(hints[0]).toContain('LOCKED');
                expect(hints[1]).toContain('ON" or "OFF');
                expect(hints[2]).toContain('PRESS');
                expect(hints[3]).toContain('Temperature');
                expect(hints[4]).toContain('speed (1-100)');
                expect(hints[5]).toContain('Check context');
            });
        });

        it('should return error if device not found', async () => {
            (prisma.device.findFirst as jest.Mock).mockResolvedValue(null);
            const res = await callTool('get_device_detail', { deviceToken: 'non-exist' });
            assertError(res, 'Thiết bị không tồn tại.');
        });
    });

    describe('control_device', () => {
        it('should queue control message correctly', async () => {
            (prisma.device.findFirst as jest.Mock).mockResolvedValue({
                token: 'tk-1', name: 'Door',
                entities: [{ code: 'main', readOnly: false }]
            });
            (deviceQueue.add as jest.Mock).mockResolvedValue({});

            const res = await callTool('control_device', { deviceToken: 't1', entityCode: 'main', value: 'OPEN', userId: 'user-id' });

            expect(deviceQueue.add).toHaveBeenCalledWith(
                'control_cmd',
                expect.objectContaining({
                    token: 'tk-1',
                    entityCode: 'main',
                    value: 'OPEN',
                    userId: 'user-id',
                    source: 'ai'
                }),
                expect.any(Object)
            );

            assertSuccess(res, (data) => {
                expect(data.status).toBe('queued');
            });
        });

        it('should use default admin-ai userId if none provided', async () => {
            (prisma.device.findFirst as jest.Mock).mockResolvedValue({
                token: 'tk-1', name: 'Door',
                entities: [{ code: 'main', readOnly: false }]
            });
            (deviceQueue.add as jest.Mock).mockResolvedValue({});

            await callTool('control_device', { deviceToken: 't1', entityCode: 'main', value: 'OPEN' });
            expect(deviceQueue.add).toHaveBeenCalledWith('control_cmd', expect.objectContaining({ userId: 'admin-ai' }), expect.any(Object));
        });

        it('should fail if device is missing', async () => {
            (prisma.device.findFirst as jest.Mock).mockResolvedValue(null);
            const res = await callTool('control_device', { deviceToken: 't1', entityCode: 'main', value: 'OPEN', userId: 'user1' });
            assertError(res, 'bạn không có quyền');
        });

        it('should fail if entity is missing', async () => {
            (prisma.device.findFirst as jest.Mock).mockResolvedValue({
                token: 'tk-1', name: 'Door',
                entities: [{ code: 'other', readOnly: false }]
            });
            const res = await callTool('control_device', { deviceToken: 't1', entityCode: 'main', value: 'OPEN' });
            assertError(res, 'Entity "main" không tồn tại');
        });

        it('should fail if entity is read-only', async () => {
            (prisma.device.findFirst as jest.Mock).mockResolvedValue({
                token: 'tk-1', name: 'Door',
                entities: [{ code: 'sensor', readOnly: true }]
            });
            const res = await callTool('control_device', { deviceToken: 't1', entityCode: 'sensor', value: '1' });
            assertError(res, 'read-only');
        });

        it('should fail if BullMQ push crashes', async () => {
            (prisma.device.findFirst as jest.Mock).mockResolvedValue({
                token: 'tk-1', name: 'Door',
                entities: [{ code: 'main', readOnly: false }]
            });
            (deviceQueue.add as jest.Mock).mockRejectedValue(new Error('BullMQ offline'));

            const res = await callTool('control_device', { deviceToken: 't1', entityCode: 'main', value: 'OPEN' });
            assertError(res, 'Lỗi khi gửi lệnh: Error: BullMQ offline');
        });
    });
});
