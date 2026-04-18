import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { registerSchemaResource } from './schema.resource';
import * as fs from 'fs';

jest.mock('fs', () => ({
    readFileSync: jest.fn(),
}));

describe('Schema Resource', () => {
    let mockServer: jest.Mocked<McpServer>;
    const registeredResources: Map<string, (...args: any[]) => any> = new Map();

    beforeEach(() => {
        jest.clearAllMocks();
        registeredResources.clear();
        mockServer = {
            resource: jest.fn().mockImplementation((name, uri, shape, handler) => {
                registeredResources.set(uri, handler);
            }),
        } as any;
        registerSchemaResource(mockServer);
    });

    const callResource = async (uri: string) => {
        const handler = registeredResources.get(uri);
        if (!handler) throw new Error(`Resource ${uri} not found`);
        return handler();
    };

    it('should return schema content if a path works', async () => {
        // Make the second path work
        (fs.readFileSync as jest.Mock)
            .mockImplementationOnce(() => { throw new Error('Not found'); })
            .mockImplementationOnce(() => 'model User { id String @id }');

        const res = await callResource('prisma://schema');
        expect(res.contents[0].text).toBe('model User { id String @id }');
    });

    it('should return fallback message if no paths work', async () => {
        (fs.readFileSync as jest.Mock).mockImplementation(() => { throw new Error('Not found'); });

        const res = await callResource('prisma://schema');
        expect(res.contents[0].text).toContain('Schema file not found');
    });

    it('should catch generic execution block exceptions', async () => {
        // Manually force an error not in fs but from the outer try block to test the catch (error) branch.
        // Easiest is to mock process.cwd to throw.
        const spy = jest.spyOn(process, 'cwd').mockImplementation(() => { throw new Error('CWD Crash'); });

        const res = await callResource('prisma://schema');
        expect(res.contents[0].text).toContain('CWD Crash');

        spy.mockRestore();
    });
});
