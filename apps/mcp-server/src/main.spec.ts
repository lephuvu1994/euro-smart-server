import { bootstrapMcpServer } from './main';
import express from 'express';

jest.mock('express', () => {
    const use = jest.fn();
    const get = jest.fn();
    const post = jest.fn();
    const listen = jest.fn();
    return jest.fn(() => ({
        use,
        get,
        post,
        listen,
    })) as any;
});

jest.mock('@modelcontextprotocol/sdk/server/mcp.js', () => {
    return {
        McpServer: jest.fn().mockImplementation(() => ({
            tool: jest.fn(),
            resource: jest.fn(),
            connect: jest.fn().mockResolvedValue(undefined),
        })),
    };
});

describe('MCP Server Main Entry', () => {
    beforeEach(() => {
        jest.clearAllMocks();
    });

    it('should initialize express setup perfectly', async () => {
        process.env.MCP_SECRET = 'test-secret';
        const { app } = await bootstrapMcpServer();
        expect(app.use).toHaveBeenCalled(); // Auth middleware
        expect(app.get).toHaveBeenCalledWith('/sse', expect.any(Function));
        expect(app.post).toHaveBeenCalledWith('/message', expect.any(Function));
    });

    it('middleware should reject invalid secret', async () => {
        process.env.MCP_SECRET = 'abc';
        const { app } = await bootstrapMcpServer();

        // Simulate middleware call
        const middlewareFn = (app.use as jest.Mock).mock.calls[0][0];
        const mockReq = { headers: { 'x-mcp-secret': 'wrong' } };
        const mockRes = { status: jest.fn().mockReturnThis(), json: jest.fn() };
        const mockNext = jest.fn();

        middlewareFn(mockReq, mockRes, mockNext);
        expect(mockRes.status).toHaveBeenCalledWith(401);
        expect(mockNext).not.toHaveBeenCalled();

        // correct secret
        const mockReqGood = { headers: { 'x-mcp-secret': 'abc' } };
        middlewareFn(mockReqGood, mockRes, mockNext);
        expect(mockNext).toHaveBeenCalled();
    });
});
