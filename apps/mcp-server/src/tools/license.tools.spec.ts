import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { registerLicenseTools } from './license.tools';
import prisma from '../prisma';
import { createPendingAction } from '../utils/confirm';

jest.mock('../prisma', () => ({
    __esModule: true,
    default: {
        licenseQuota: {
            findMany: jest.fn(),
            findUnique: jest.fn(),
            upsert: jest.fn(),
        },
        partner: {
            findUnique: jest.fn(),
        },
        deviceModel: {
            findUnique: jest.fn(),
        },
    },
}));

jest.mock('../utils/confirm', () => ({
    createPendingAction: jest.fn(),
}));

describe('License Tools', () => {
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
        registerLicenseTools(mockServer);
    });

    const callTool = async (name: string, args: any) => {
        const handler = registeredTools.get(name);
        if (!handler) throw new Error(`Tool ${name} not found`);
        return handler(args);
    };

    describe('list_quotas', () => {
        it('should list quotas with filtering', async () => {
            (prisma.licenseQuota.findMany as jest.Mock).mockResolvedValue([
                {
                    activatedCount: 5, maxQuantity: 10, licenseDays: 90, isActive: true,
                    partner: { code: 'P1', name: 'PN1' },
                    deviceModel: { code: 'M1', name: 'MN1' }
                },
                {
                    activatedCount: 0, maxQuantity: 0, licenseDays: 90, isActive: false,
                    partner: { code: 'P2', name: 'PN2' },
                    deviceModel: { code: 'M2', name: 'MN2' }
                }
            ]);

            const res = await callTool('list_quotas', { partnerCode: 'P1', modelCode: 'M1', lang: 'vi' });
            expect(prisma.licenseQuota.findMany).toHaveBeenCalledWith(expect.objectContaining({
                where: { partner: { code: 'P1' }, deviceModel: { code: 'M1' } }
            }));
            expect(res.content[0].text).toContain('50%'); // 5/10 used
            expect(res.content[0].text).toContain('0%'); // 0/0 fallback
        });
    });

    describe('set_license', () => {
        it('should fail if partner not found', async () => {
            (prisma.partner.findUnique as jest.Mock).mockResolvedValue(null);
            const res = await callTool('set_license', { partnerCode: 'P', modelCode: 'M', maxQuantity: 10 });
            expect(res.content[0].text).toContain('P');
        });

        it('should fail if model not found', async () => {
            (prisma.partner.findUnique as jest.Mock).mockResolvedValue({ id: '1' });
            (prisma.deviceModel.findUnique as jest.Mock).mockResolvedValue(null);
            const res = await callTool('set_license', { partnerCode: 'P', modelCode: 'M', maxQuantity: 10 });
            expect(res.content[0].text).toContain('M');
        });

        it('should create pending action to upsert quota', async () => {
            (prisma.partner.findUnique as jest.Mock).mockResolvedValue({ id: 'p1', name: 'PN1' });
            (prisma.deviceModel.findUnique as jest.Mock).mockResolvedValue({ id: 'm1', name: 'MN1' });
            (prisma.licenseQuota.findUnique as jest.Mock).mockResolvedValue(null);
            (createPendingAction as jest.Mock).mockReturnValue('pending_mock');

            const res = await callTool('set_license', { partnerCode: 'P', modelCode: 'M', maxQuantity: 10, licenseDays: 90, lang: 'vi' });
            expect(res.content[0].text).toBe('pending_mock');

            const actionFn = (createPendingAction as jest.Mock).mock.calls[0][2];
            await actionFn();
            expect(prisma.licenseQuota.upsert).toHaveBeenCalledWith({
                where: { partnerId_deviceModelId: { partnerId: 'p1', deviceModelId: 'm1' } },
                update: { maxQuantity: 10, licenseDays: 90, isActive: true },
                create: { partnerId: 'p1', deviceModelId: 'm1', maxQuantity: 10, activatedCount: 0, licenseDays: 90, isActive: true }
            });
        });

        it('should create pending action for an existing quota', async () => {
            (prisma.partner.findUnique as jest.Mock).mockResolvedValue({ id: 'p1', name: 'PN1' });
            (prisma.deviceModel.findUnique as jest.Mock).mockResolvedValue({ id: 'm1', name: 'MN1' });
            (prisma.licenseQuota.findUnique as jest.Mock).mockResolvedValue({ maxQuantity: 5, licenseDays: 30 });
            (createPendingAction as jest.Mock).mockReturnValue('pending_mock_update');

            const res = await callTool('set_license', { partnerCode: 'P', modelCode: 'M', maxQuantity: 20, licenseDays: 90, lang: 'vi' });

            // Verification of action execution is covered in previous test, just verify the action text path triggered.
            expect(res.content[0].text).toBe('pending_mock_update');
        });
    });

    describe('get_quota_usage', () => {
        it('should return error if partner not found', async () => {
            (prisma.partner.findUnique as jest.Mock).mockResolvedValue(null);
            const res = await callTool('get_quota_usage', { partnerCode: 'P', lang: 'vi' });
            expect(res.content[0].text).toContain('P');
        });

        it('should return aggregated usage perfectly', async () => {
            (prisma.partner.findUnique as jest.Mock).mockResolvedValue({
                code: 'P1', name: 'PN1', isActive: true,
                quotas: [
                    { activatedCount: 5, maxQuantity: 10, licenseDays: 90, deviceModel: { code: 'M1', name: 'MN1' } },
                    { activatedCount: 5, maxQuantity: 10, licenseDays: 90, deviceModel: { code: 'M1', name: 'MN1' } },
                    { activatedCount: 0, maxQuantity: 0, licenseDays: 90, deviceModel: { code: 'M2', name: 'MN2' } }
                ]
            });

            const res = await callTool('get_quota_usage', { partnerCode: 'P1', lang: 'vi' });
            expect(res.content[0].text).toContain('10'); // Total used = 10
            expect(res.content[0].text).toContain('20'); // Total allocated = 20
            expect(res.content[0].text).toContain('50%'); // Overall 10/20 = 50%
            expect(res.content[0].text).toContain('0%'); // Model 2 0/0 = 0%
        });
    });
});
