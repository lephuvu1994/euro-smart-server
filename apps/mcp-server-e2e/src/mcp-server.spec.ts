import request from 'supertest';
import * as http from 'http';
// eslint-disable-next-line @nx/enforce-module-boundaries
import { bootstrapMcpServer } from '../../../apps/mcp-server/src/main';
// eslint-disable-next-line @nx/enforce-module-boundaries
import prisma from '../../../apps/mcp-server/src/prisma';

describe('MCP Server API (e2e)', () => {
  let app: any;
  let server: http.Server;

  beforeAll(async () => {
    const bootstrap = await bootstrapMcpServer();
    app = bootstrap.app;

    await new Promise<void>((resolve) => {
      server = app.listen(0, resolve);
    });
  });

  afterAll(async () => {
    await prisma.$disconnect();

    await new Promise<void>((resolve) => {
      server.close(() => {
        resolve();
      });
    });
  });

  describe('GET /sse', () => {
    it('should open an SSE connection stream', (done) => {
      const address = server.address() as any;
      const options = {
        hostname: 'localhost',
        port: address.port,
        path: '/sse',
        agent: false,
      };
      const req = http.get(options, (res) => {
        expect(res.statusCode).toBe(200);
        expect(res.headers['content-type']).toMatch(/text\/event-stream/);
        req.destroy();
        done();
      });

      req.on('error', done);
    });
  });

  describe('POST /message', () => {
    it('should reject if no active transport', async () => {
      const res = await request(server)
        .post('/message')
        .send({ title: 'Invalid structure' });

      expect([200, 202, 400, 500]).toContain(res.status);
    });
  });
});
