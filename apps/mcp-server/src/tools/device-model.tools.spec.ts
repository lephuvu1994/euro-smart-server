import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { registerDeviceModelTools } from './device-model.tools';
import prisma from '../prisma';
import { createPendingAction } from '../utils/confirm';

jest.mock('../prisma', () => ({
    __esModule: true,
    default: {
        deviceModel: {
            findMany: jest.fn(),
            findUnique: jest.fn(),
            create: jest.fn(),
            update: jest.fn(),
        },
        partner: {
            findUnique: jest.fn(),
        },
        licenseQuota: {
            upsert: jest.fn(),
        },
    },
}));

jest.mock('../utils/confirm', () => ({
    createPendingAction: jest.fn(),
}));

describe('Device Model Tools', () => {
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
        registerDeviceModelTools(mockServer);
    });

    const callTool = async (name: string, args: any) => {
        const handler = registeredTools.get(name);
        if (!handler) throw new Error(`Tool ${name} not found`);
        return handler(args);
    };

    describe('list_device_models', () => {
        it('should list all models with aggregation', async () => {
            (prisma.deviceModel.findMany as jest.Mock).mockResolvedValue([
                {
                    code: 'M1', name: 'Model 1', description: 'Desc', config: {},
                    createdAt: new Date('2026-01-01'), _count: { devices: 10, hardwares: 20 }
                }
            ]);

            const res = await callTool('list_device_models', { lang: 'en' });
            expect(prisma.deviceModel.findMany).toHaveBeenCalled();
            expect(res.content[0].text).toContain('Model 1');
            expect(res.content[0].text).toContain('20');
        });
    });

    describe('create_device_model', () => {
        it('should return error if model code exists', async () => {
            (prisma.deviceModel.findUnique as jest.Mock).mockResolvedValue({ name: 'Existing' });
            const res = await callTool('create_device_model', { code: 'M1', name: 'M1' });
            expect(res.content[0].text).toContain('M1'); // Error string
        });

        it('should return error if config JSON is invalid', async () => {
            (prisma.deviceModel.findUnique as jest.Mock).mockResolvedValue(null);
            const res = await callTool('create_device_model', { code: 'M1', name: 'M1', config: '{bad json}' });
            expect(res.content[0].text).toBeDefined();
            expect(createPendingAction).not.toHaveBeenCalled();
        });

        it('should create pending action on success', async () => {
            (prisma.deviceModel.findUnique as jest.Mock).mockResolvedValue(null);
            (createPendingAction as jest.Mock).mockReturnValue('pending_create');

            const res = await callTool('create_device_model', { code: 'M1', name: 'Name', description: 'Desc', config: '{"key":"val"}' });
            expect(res.content[0].text).toBe('pending_create');

            const actionFn = (createPendingAction as jest.Mock).mock.calls[0][2];
            (prisma.deviceModel.create as jest.Mock).mockResolvedValue({ id: '1' });
            await actionFn();

            expect(prisma.deviceModel.create).toHaveBeenCalledWith({
                data: {
                    code: 'M1',
                    name: 'Name',
                    description: 'Desc',
                    config: { key: 'val' }
                }
            });
        });
    });

    describe('update_device_model', () => {
        it('should return error if model not found', async () => {
            (prisma.deviceModel.findUnique as jest.Mock).mockResolvedValue(null);
            const res = await callTool('update_device_model', { code: 'M1' });
            expect(res.content[0].text).toContain('M1');
        });

        it('should return no changes error if no fields provided', async () => {
            (prisma.deviceModel.findUnique as jest.Mock).mockResolvedValue({ code: 'M1', name: 'Old' });
            const res = await callTool('update_device_model', { code: 'M1' });
            expect(res.content[0].text).toBeDefined(); // no fields
        });

        it('should return invalid config error', async () => {
            (prisma.deviceModel.findUnique as jest.Mock).mockResolvedValue({ code: 'M1', name: 'Old' });
            const res = await callTool('update_device_model', { code: 'M1', config: 'bad' });
            expect(createPendingAction).not.toHaveBeenCalled();
        });

        it('should create pending update action', async () => {
            (prisma.deviceModel.findUnique as jest.Mock).mockResolvedValue({ code: 'M1', name: 'Old' });
            (createPendingAction as jest.Mock).mockReturnValue('pending_update');

            const res = await callTool('update_device_model', { code: 'M1', name: 'New', description: 'Desc', config: '{"a":1}' });
            expect(res.content[0].text).toBe('pending_update');

            const actionFn = (createPendingAction as jest.Mock).mock.calls[0][2];
            await actionFn();

            expect(prisma.deviceModel.update).toHaveBeenCalledWith({
                where: { code: 'M1' },
                data: { name: 'New', description: 'Desc', config: { a: 1 } }
            });
        });
    });

    describe('assign_model_to_partner', () => {
        it('should return error if partner not found', async () => {
            (prisma.partner.findUnique as jest.Mock).mockResolvedValue(null);
            const res = await callTool('assign_model_to_partner', { partnerCode: 'P', modelCode: 'M', maxQuantity: 10 });
            expect(res.content[0].text).toContain('P');
        });

        it('should return error if model not found', async () => {
            (prisma.partner.findUnique as jest.Mock).mockResolvedValue({ id: 'p1', name: 'PN' });
            (prisma.deviceModel.findUnique as jest.Mock).mockResolvedValue(null);
            const res = await callTool('assign_model_to_partner', { partnerCode: 'P', modelCode: 'M', maxQuantity: 10 });
            expect(res.content[0].text).toContain('M');
        });

        it('should create pending assign action', async () => {
            (prisma.partner.findUnique as jest.Mock).mockResolvedValue({ id: 'p1', name: 'PN' });
            (prisma.deviceModel.findUnique as jest.Mock).mockResolvedValue({ id: 'm1', name: 'MN' });
            (createPendingAction as jest.Mock).mockReturnValue('pending_assign');

            const res = await callTool('assign_model_to_partner', { partnerCode: 'P', modelCode: 'M', maxQuantity: 10, licenseDays: 90 });
            expect(res.content[0].text).toBe('pending_assign');

            const actionFn = (createPendingAction as jest.Mock).mock.calls[0][2];
            await actionFn();

            expect(prisma.licenseQuota.upsert).toHaveBeenCalledWith({
                where: { partnerId_deviceModelId: { partnerId: 'p1', deviceModelId: 'm1' } },
                update: { maxQuantity: 10, licenseDays: 90 },
                create: { partnerId: 'p1', deviceModelId: 'm1', maxQuantity: 10, activatedCount: 0, licenseDays: 90, isActive: true }
            });
        });
    });
});
