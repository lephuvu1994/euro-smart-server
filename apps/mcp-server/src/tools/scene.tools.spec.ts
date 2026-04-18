import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { registerSceneTools } from './scene.tools';
import prisma from '../prisma';
import { deviceQueue } from '../shared/redis';
import { createOrExecuteAction } from '../utils/confirm';

jest.mock('../prisma', () => ({
    __esModule: true,
    default: {
        scene: {
            findMany: jest.fn(),
            findFirst: jest.fn(),
            update: jest.fn(),
            delete: jest.fn(),
        },
    },
}));

jest.mock('../shared/redis', () => ({
    deviceQueue: {
        add: jest.fn(),
    },
}));

jest.mock('../utils/confirm', () => ({
    createOrExecuteAction: jest.fn(),
}));

describe('Scene Tools', () => {
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
        registerSceneTools(mockServer);
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

    const assertSuccess = (result: any, matchFn?: (data: any) => void) => {
        expect(result.content[0].type).toBe('text');
        if (matchFn) {
            let parsed;
            try {
                parsed = JSON.parse(result.content[0].text);
            } catch {
                parsed = result.content[0].text;
            }
            matchFn(parsed);
        }
    };

    describe('list_scenes', () => {
        it('should list all scenes for admin', async () => {
            (prisma.scene.findMany as jest.Mock).mockResolvedValue([{ id: 's1', name: 'Scene 1' }]);
            const res = await callTool('list_scenes', { take: 10 });
            expect(prisma.scene.findMany).toHaveBeenCalledWith(expect.objectContaining({ where: {} }));
            assertSuccess(res, (data) => expect(data).toHaveLength(1));
        });

        it('should list scenes filtering by userId for user', async () => {
            (prisma.scene.findMany as jest.Mock).mockResolvedValue([]);
            const res = await callTool('list_scenes', { take: 10, userId: 'u1' });
            expect(prisma.scene.findMany).toHaveBeenCalledWith(expect.objectContaining({
                where: { home: { ownerId: 'u1' } },
                take: 10
            }));
            assertSuccess(res, (data) => expect(data).toHaveLength(0));
        });
    });

    describe('get_scene_detail', () => {
        it('should return scene details successfully', async () => {
            (prisma.scene.findFirst as jest.Mock).mockResolvedValue({ id: 's1', name: 'Scene 1' });
            const res = await callTool('get_scene_detail', { sceneId: 's1' });
            assertSuccess(res, (data) => expect(data.name).toBe('Scene 1'));
        });

        it('should return error if not found or unauthorized', async () => {
            (prisma.scene.findFirst as jest.Mock).mockResolvedValue(null);
            const res = await callTool('get_scene_detail', { sceneId: 's1', userId: 'u1' });
            assertError(res, 'bạn không có quyền');

            const resAdmin = await callTool('get_scene_detail', { sceneId: 's1' });
            assertError(resAdmin, 'Kịch bản không tồn tại.');
        });
    });

    describe('run_scene', () => {
        it('should trigger inactive error', async () => {
            (prisma.scene.findFirst as jest.Mock).mockResolvedValue({ id: 's1', name: 'S1', active: false });
            const res = await callTool('run_scene', { sceneId: 's1' });
            assertError(res, 'đang bị tắt. Không thể thực thi.');
        });

        it('should trigger BullMQ queue with delay correctly', async () => {
            (prisma.scene.findFirst as jest.Mock).mockResolvedValue({ id: 's1', name: 'S1', active: true });
            (deviceQueue.add as jest.Mock).mockResolvedValue(true);

            const res = await callTool('run_scene', { sceneId: 's1', delaySeconds: 5 });
            expect(deviceQueue.add).toHaveBeenCalledWith('run_scene', { sceneId: 's1' }, expect.objectContaining({ delay: 5000 }));
            assertSuccess(res, (data) => expect(data.status).toBe('queued'));
        });

        it('should return error if not found', async () => {
            (prisma.scene.findFirst as jest.Mock).mockResolvedValue(null);
            const res = await callTool('run_scene', { sceneId: 's2' });
            assertError(res, 'Kịch bản không tồn tại');
        });

        it('should return error if bullMQ throws', async () => {
            (prisma.scene.findFirst as jest.Mock).mockResolvedValue({ id: 's1', name: 'S1', active: true });
            (deviceQueue.add as jest.Mock).mockRejectedValue(new Error('BullMQ failure'));

            const res = await callTool('run_scene', { sceneId: 's1' });
            assertError(res, 'Lỗi khi gửi lệnh: Error: BullMQ failure');
        });
    });

    describe('toggle_scene_active', () => {
        it('should use createOrExecuteAction successfully', async () => {
            (prisma.scene.findFirst as jest.Mock).mockResolvedValue({ id: 's1', name: 'S1' });
            (createOrExecuteAction as jest.Mock).mockImplementation(async (lang, desc, action) => {
                await action();
                return 'success!';
            });
            (prisma.scene.update as jest.Mock).mockResolvedValue({ id: 's1', active: true });

            const res = await callTool('toggle_scene_active', { sceneId: 's1', active: true, lang: 'en' });

            expect(prisma.scene.update).toHaveBeenCalledWith({ where: { id: 's1' }, data: { active: true } });
            assertSuccess(res, (data) => expect(data).toBe('success!'));
        });

        it('should return error if not found', async () => {
            (prisma.scene.findFirst as jest.Mock).mockResolvedValue(null);
            const res = await callTool('toggle_scene_active', { sceneId: 's1', active: true });
            assertError(res, 'Kịch bản không tồn tại');
        });
    });

    describe('delete_scene', () => {
        it('should use createOrExecuteAction successfully', async () => {
            (prisma.scene.findFirst as jest.Mock).mockResolvedValue({ id: 's1', name: 'S1' });
            (createOrExecuteAction as jest.Mock).mockImplementation(async (lang, desc, action) => {
                await action();
                return 'deleted!';
            });
            (prisma.scene.delete as jest.Mock).mockResolvedValue({});

            const res = await callTool('delete_scene', { sceneId: 's1', userId: 'usr1' });

            expect(prisma.scene.delete).toHaveBeenCalledWith({ where: { id: 's1' } });
            assertSuccess(res, (data) => expect(data).toBe('deleted!'));
        });

        it('should return error if not found', async () => {
            (prisma.scene.findFirst as jest.Mock).mockResolvedValue(null);
            const res = await callTool('delete_scene', { sceneId: 's1', userId: 'usr1' });
            assertError(res, 'bạn không có quyền');
        });
    });
});
