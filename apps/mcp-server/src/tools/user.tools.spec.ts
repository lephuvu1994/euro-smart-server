import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { registerUserTools } from './user.tools';
import prisma from '../prisma';
import { createPendingAction } from '../utils/confirm';

jest.mock('../prisma', () => ({
    __esModule: true,
    default: {
        user: {
            findMany: jest.fn(),
            count: jest.fn(),
        },
        device: { count: jest.fn() },
        partner: { count: jest.fn() },
        hardwareRegistry: { count: jest.fn() },
        scene: { count: jest.fn() },
        systemConfig: {
            findMany: jest.fn(),
            findUnique: jest.fn(),
            upsert: jest.fn(),
        },
    },
}));

jest.mock('../utils/confirm', () => ({
    createPendingAction: jest.fn(),
}));

describe('User Tools', () => {
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
        registerUserTools(mockServer);
    });

    const callTool = async (name: string, args: any) => {
        const handler = registeredTools.get(name);
        if (!handler) throw new Error(`Tool ${name} not found`);
        return handler(args);
    };

    const assertSuccess = (result: any, matchFn: (data: any) => void) => {
        expect(result.content[0].type).toBe('text');
        let parsed;
        try {
            parsed = JSON.parse(result.content[0].text);
        } catch {
            parsed = result.content[0].text;
        }
        matchFn(parsed);
    };

    describe('list_users', () => {
        it('should list users with advanced filtering and pagination', async () => {
            (prisma.user.findMany as jest.Mock).mockResolvedValue([
                {
                    id: '1', firstName: 'John', lastName: 'Doe', email: 'j@d.com', phone: '123',
                    role: 'ADMIN', createdAt: new Date('2026-01-01'), _count: { ownedDevices: 2, ownedHomes: 1 }
                },
                {
                    id: '2', firstName: '', lastName: '', email: 'no@name.cx', phone: '456',
                    role: 'USER', createdAt: new Date('2026-01-02'), _count: { ownedDevices: 0, ownedHomes: 0 }
                }
            ]);
            (prisma.user.count as jest.Mock).mockResolvedValue(2);

            const res = await callTool('list_users', { page: 1, limit: 10, search: 'Doe', role: 'ADMIN', lang: 'en' });

            expect(prisma.user.findMany).toHaveBeenCalledWith(expect.objectContaining({
                skip: 0, take: 10,
                where: expect.objectContaining({
                    role: 'ADMIN',
                    OR: expect.any(Array)
                })
            }));

            // Asserts inner JSON in the formatted string since the tool returns t(lang, key, { result }) and our mock strings that together
            expect(res.content[0].text).toContain('John Doe');
            expect(res.content[0].text).toContain('(unnamed)');
            // Ah, i18n is NOT mocked in this test file, so it relies on the real i18n! The real i18n returns "Người dùng ẩn danh" in vi, "Unnamed user" in en.
            expect(res.content[0].text).toContain('2026-01-01');
        });
    });

    describe('count_users', () => {
        it('should get aggregated statistics of users', async () => {
            (prisma.user.count as jest.Mock)
                .mockResolvedValueOnce(100) // total
                .mockResolvedValueOnce(5)   // today
                .mockResolvedValueOnce(10)  // week
                .mockResolvedValueOnce(20); // month

            const res = await callTool('count_users', { lang: 'en' });

            expect(prisma.user.count).toHaveBeenCalledTimes(4);
            expect(res.content[0].text).toContain('"total": 100');
            expect(res.content[0].text).toContain('"newToday": 5');
        });
    });

    describe('get_system_stats', () => {
        it('should gather full system dashboard statistics', async () => {
            (prisma.user.count as jest.Mock).mockResolvedValue(10);
            (prisma.device.count as jest.Mock).mockResolvedValue(30);

            (prisma.partner.count as jest.Mock)
                .mockResolvedValueOnce(5)     // total
                .mockResolvedValueOnce(3);    // active

            (prisma.hardwareRegistry.count as jest.Mock)
                .mockResolvedValueOnce(100)   // total
                .mockResolvedValueOnce(2);    // banned

            (prisma.scene.count as jest.Mock).mockResolvedValue(15);

            const res = await callTool('get_system_stats', { lang: 'vi' });

            expect(res.content[0].text).toContain('"total": 30'); // devices
            expect(res.content[0].text).toContain('"active": 3'); // partners
            expect(res.content[0].text).toContain('"banned": 2'); // hw
        });
    });

    describe('get_system_configs', () => {
        it('should return system configs array', async () => {
            (prisma.systemConfig.findMany as jest.Mock).mockResolvedValue([
                { key: 'MQTT', value: 'localhost', description: 'desc' }
            ]);

            const res = await callTool('get_system_configs', { lang: 'vi' });
            expect(res.content[0].text).toContain('MQTT');
            expect(res.content[0].text).toContain('localhost');
        });
    });

    describe('update_system_config', () => {
        it('should create pending action for updating an existing config', async () => {
            (prisma.systemConfig.findUnique as jest.Mock).mockResolvedValue({ key: 'OTP', value: '30' });
            (createPendingAction as jest.Mock).mockReturnValue('pending_mock_msg');

            const res = await callTool('update_system_config', { key: 'OTP', value: '60', description: 'desc', lang: 'vi' });

            expect(createPendingAction).toHaveBeenCalledWith(
                'vi',
                expect.stringContaining('OTP'), // Action description should contain the key
                expect.any(Function)
            );

            expect(res.content[0].text).toBe('pending_mock_msg');

            // Simulate action callback execution
            const actionFn = (createPendingAction as jest.Mock).mock.calls[0][2];
            await actionFn();
            expect(prisma.systemConfig.upsert).toHaveBeenCalledWith(expect.objectContaining({
                where: { key: 'OTP' },
                update: { value: '60' }
            }));
        });

        it('should create pending action for a NEW config', async () => {
            (prisma.systemConfig.findUnique as jest.Mock).mockResolvedValue(null);
            (createPendingAction as jest.Mock).mockReturnValue('pending_mock_msg2');

            const res = await callTool('update_system_config', { key: 'NEW_KEY', value: '1', lang: 'en' });

            expect(createPendingAction).toHaveBeenCalledWith(
                'en',
                expect.stringContaining('NEW_KEY'),
                expect.any(Function)
            );
            assertSuccess(res, (data) => expect(data).toBe('pending_mock_msg2'));
        });
    });
});
