import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { registerPartnerTools } from './partner.tools';
import prisma from '../prisma';
import { createPendingAction } from '../utils/confirm';

jest.mock('../prisma', () => ({
    __esModule: true,
    default: {
        partner: {
            findMany: jest.fn(),
            findUnique: jest.fn(),
            create: jest.fn(),
            update: jest.fn(),
        },
    },
}));

jest.mock('../utils/confirm', () => ({
    createPendingAction: jest.fn(),
}));

describe('Partner Tools', () => {
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
        registerPartnerTools(mockServer);
    });

    const callTool = async (name: string, args: any) => {
        const handler = registeredTools.get(name);
        if (!handler) throw new Error(`Tool ${name} not found`);
        return handler(args);
    };

    describe('list_partners', () => {
        it('should list partners with active filtering', async () => {
            (prisma.partner.findMany as jest.Mock).mockResolvedValue([
                {
                    code: 'P1', name: 'PN1', isActive: true, createdAt: new Date(),
                    quotas: [
                        { activatedCount: 2, maxQuantity: 10, licenseDays: 90, isActive: true, deviceModel: { code: 'M1', name: 'MN1' } }
                    ]
                }
            ]);

            const res = await callTool('list_partners', { isActive: true, lang: 'vi' });
            expect(prisma.partner.findMany).toHaveBeenCalledWith(expect.objectContaining({ where: { isActive: true } }));
            expect(res.content[0].text).toContain('PN1');
            expect(res.content[0].text).toContain('8'); // remaining 10 - 2
        });
    });

    describe('get_partner', () => {
        it('should return partner if exists', async () => {
            (prisma.partner.findUnique as jest.Mock).mockResolvedValue({
                code: 'P1', name: 'PN1', isActive: true, createdAt: new Date(),
                _count: { devices: 5, hardwares: 10 },
                quotas: [
                    { activatedCount: 5, maxQuantity: 10, licenseDays: 90, deviceModel: { code: 'M1', name: 'MN1' } },
                    { activatedCount: 0, maxQuantity: 0, licenseDays: 90, deviceModel: { code: 'M2', name: 'MN2' } }
                ]
            });

            const res = await callTool('get_partner', { code: 'P1', lang: 'vi' });
            expect(res.content[0].text).toContain('50%'); // 5/10 used
            expect(res.content[0].text).toContain('0%'); // 0/0 used fallback
        });

        it('should return error if not found', async () => {
            (prisma.partner.findUnique as jest.Mock).mockResolvedValue(null);
            const res = await callTool('get_partner', { code: 'Px', lang: 'vi' });
            expect(res.content[0].text).toContain('Px');
        });
    });

    describe('create_partner', () => {
        it('should return error if code exists', async () => {
            (prisma.partner.findUnique as jest.Mock).mockResolvedValue({ name: 'Exist' });
            const res = await callTool('create_partner', { code: 'P1', name: 'N', lang: 'vi' });
            expect(res.content[0].text).toContain('P1');
        });

        it('should create pending action', async () => {
            (prisma.partner.findUnique as jest.Mock).mockResolvedValue(null);
            (createPendingAction as jest.Mock).mockReturnValue('pending_mock');

            const res = await callTool('create_partner', { code: 'P1', name: 'N', lang: 'vi' });
            expect(res.content[0].text).toBe('pending_mock');

            const actionFn = (createPendingAction as jest.Mock).mock.calls[0][2];
            await actionFn();
            expect(prisma.partner.create).toHaveBeenCalledWith({ data: { code: 'P1', name: 'N', isActive: true } });
        });
    });

    describe('update_partner', () => {
        it('should return error if not found', async () => {
            (prisma.partner.findUnique as jest.Mock).mockResolvedValue(null);
            const res = await callTool('update_partner', { code: 'Px', lang: 'vi' });
            expect(res.content[0].text).toContain('Px');
        });

        it('should return no changes if nothing provided', async () => {
            (prisma.partner.findUnique as jest.Mock).mockResolvedValue({ code: 'P1' });
            const res = await callTool('update_partner', { code: 'P1', lang: 'vi' });
            expect(createPendingAction).not.toHaveBeenCalled();
        });

        it('should create pending update action', async () => {
            (prisma.partner.findUnique as jest.Mock).mockResolvedValue({ code: 'P1', name: 'Old', isActive: true });
            (createPendingAction as jest.Mock).mockReturnValue('pending_update');

            const res = await callTool('update_partner', { code: 'P1', name: 'New', isActive: false, lang: 'vi' });
            expect(res.content[0].text).toBe('pending_update');

            const actionFn = (createPendingAction as jest.Mock).mock.calls[0][2];
            await actionFn();
            expect(prisma.partner.update).toHaveBeenCalledWith({
                where: { code: 'P1' },
                data: { name: 'New', isActive: false }
            });
        });
    });
});
