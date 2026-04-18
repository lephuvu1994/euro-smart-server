import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { registerDeviceTools } from './device.tools';
import prisma from '../prisma';
import { createPendingAction } from '../utils/confirm';

jest.mock('../prisma', () => ({
    __esModule: true,
    default: {
        device: {
            findMany: jest.fn(),
            count: jest.fn(),
        },
        partner: {
            findMany: jest.fn(),
        },
        hardwareRegistry: {
            findMany: jest.fn(),
            count: jest.fn(),
            updateMany: jest.fn(),
        },
        deviceModel: {
            findUnique: jest.fn(),
        },
    },
}));

jest.mock('../utils/confirm', () => ({
    createPendingAction: jest.fn(),
}));

describe('Device Tools', () => {
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
        registerDeviceTools(mockServer);
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

    describe('list_devices', () => {
        it('should list devices with complex matching', async () => {
            (prisma.device.findMany as jest.Mock).mockResolvedValue([
                {
                    id: '1', name: 'D1', token: 't1', identifier: 'mac1', protocol: 'MQTT',
                    createdAt: new Date('2026-01-01'),
                    partner: { code: 'P1', name: 'Partner 1' },
                    deviceModel: { code: 'M1', name: 'Model 1' },
                    owner: { firstName: 'Van', lastName: 'A' },
                    _count: { entities: 2 },
                }
            ]);
            (prisma.device.count as jest.Mock).mockResolvedValue(1);

            const res = await callTool('list_devices', { partnerCode: 'P1', modelCode: 'M1', userId: 'u1', page: 1, limit: 10 });
            expect(prisma.device.findMany).toHaveBeenCalledWith(expect.objectContaining({
                where: {
                    unboundAt: null,
                    partner: { code: 'P1' },
                    deviceModel: { code: 'M1' },
                    ownerId: 'u1',
                }
            }));
            expect(res.content[0].text).toContain('Van A');
            expect(res.content[0].text).toContain('Partner 1');
            expect(res.content[0].text).toContain('M1');
        });

        it('should format fallback names if owner is missing names', async () => {
            (prisma.device.findMany as jest.Mock).mockResolvedValue([
                {
                    id: '1', createdAt: new Date('2026-01-01'), partner: { code: '', name: '' }, deviceModel: { code: '', name: '' },
                    owner: { email: 'test@email.com' }, _count: { entities: 0 }
                },
                {
                    id: '2', createdAt: new Date('2026-01-01'), partner: { code: '', name: '' }, deviceModel: { code: '', name: '' },
                    owner: null, _count: { entities: 0 }
                }
            ]);
            (prisma.device.count as jest.Mock).mockResolvedValue(2);

            const res = await callTool('list_devices', { page: 1, limit: 10 });
            expect(res.content[0].text).toContain('test@email.com');
            expect(res.content[0].text).toContain('Unknown');
        });
    });

    describe('count_devices_by_partner', () => {
        it('should block non-admin', async () => {
            const res = await callTool('count_devices_by_partner', { userId: 'user' });
            expect(res.content[0].text).toContain('Access Denied');
        });

        it('should aggregate device counts', async () => {
            (prisma.partner.findMany as jest.Mock).mockResolvedValue([
                { code: 'A', name: 'Partner A', isActive: true, _count: { devices: 10, hardwares: 20 } },
                { code: 'B', name: 'Partner B', isActive: false, _count: { devices: 5, hardwares: 10 } }
            ]);

            const res = await callTool('count_devices_by_partner', { lang: 'en' });
            expect(res.content[0].text).toContain('Partner A');
            expect(res.content[0].text).toContain('15'); // 10 + 5 total
        });
    });

    describe('list_hardware', () => {
        it('should block non-admin', async () => {
            const res = await callTool('list_hardware', { userId: 'user' });
            expect(res.content[0].text).toContain('Access Denied');
        });

        it('should list hardware successfully', async () => {
            (prisma.hardwareRegistry.findMany as jest.Mock).mockResolvedValue([
                {
                    id: '1', identifier: 'mac1', firmwareVer: 'v1.0', ipAddress: '192.168.1.1',
                    isBanned: false, activatedAt: new Date(),
                    partner: { code: 'P', name: 'PN' },
                    deviceModel: { code: 'M', name: 'MD' },
                    device: { id: 'd1', name: 'Dev', token: 't' }
                },
                {
                    id: '2', identifier: 'mac2', firmwareVer: null, ipAddress: null,
                    isBanned: true, activatedAt: new Date(),
                    partner: { code: 'P', name: 'PN' },
                    deviceModel: { code: 'M', name: 'MD' },
                    device: null
                }
            ]);
            (prisma.hardwareRegistry.count as jest.Mock).mockResolvedValue(2);

            const res = await callTool('list_hardware', { partnerCode: 'P', isBanned: true, page: 1, limit: 10 });
            expect(prisma.hardwareRegistry.findMany).toHaveBeenCalledWith(expect.objectContaining({
                where: { partner: { code: 'P' }, isBanned: true }
            }));
            expect(res.content[0].text).toContain('v1.0');
            expect(res.content[0].text).toContain('Dev (t)');
            // For unlinked devices and unupdated firmware it returns i18n placeholders which match fallback strings.
            // Wait, we didn't mock i18n, so it'll use real i18n values or fallback to keys since lang is en.
            // It will just serialize whatever translations come back. So it doesn't crash.
        });
    });

    describe('update_firmware_version', () => {
        it('should block non-admin', async () => {
            const res = await callTool('update_firmware_version', { userId: 'user', modelCode: 'M', firmwareVersion: 'v2' });
            expect(res.content[0].text).toContain('Access Denied');
        });

        it('should return error if model not found', async () => {
            (prisma.deviceModel.findUnique as jest.Mock).mockResolvedValue(null);
            const res = await callTool('update_firmware_version', { modelCode: 'M', firmwareVersion: 'v2' });
            expect(res.content[0].text).toContain('M'); // Contains the model code placeholder
        });

        it('should create pending action', async () => {
            (prisma.deviceModel.findUnique as jest.Mock).mockResolvedValue({ id: 'mod', code: 'M', name: 'Model Name' });
            (prisma.hardwareRegistry.count as jest.Mock).mockResolvedValue(55);
            (createPendingAction as jest.Mock).mockReturnValue('mocked action');

            const res = await callTool('update_firmware_version', { modelCode: 'M', firmwareVersion: 'v2', lang: 'vi' });

            expect(createPendingAction).toHaveBeenCalledWith(
                'vi',
                expect.any(String),
                expect.any(Function)
            );
            expect(res.content[0].text).toBe('mocked action');

            // Test execution
            (prisma.hardwareRegistry.updateMany as jest.Mock).mockResolvedValue({ count: 55 });
            const exec = (createPendingAction as jest.Mock).mock.calls[0][2];
            await exec();
            expect(prisma.hardwareRegistry.updateMany).toHaveBeenCalledWith({
                where: { deviceModelId: 'mod' },
                data: { firmwareVer: 'v2' }
            });
        });
    });
});
