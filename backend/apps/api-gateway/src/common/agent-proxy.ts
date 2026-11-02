import { INestApplication, Logger } from '@nestjs/common';
import { Server } from 'http';
import { createProxyMiddleware } from 'http-proxy-middleware';
import { env, envInt } from '@app/common';

/**
 * Door agents connect to the gateway at /agent-socket (Socket.IO path); traffic,
 * including the WebSocket upgrade, is forwarded to access-service.
 */
export function attachAgentSocketProxy(app: INestApplication, server: Server): void {
  const target = `http://${env('ACCESS_WS_HOST', '127.0.0.1')}:${envInt('ACCESS_WS_PORT', 4004)}`;
  const proxy = createProxyMiddleware({
    target,
    ws: true,
    changeOrigin: true,
    pathFilter: '/agent-socket',
    logger: undefined,
  });
  app.use(proxy);
  server.on('upgrade', (req, socket, head) => {
    if (req.url?.startsWith('/agent-socket')) proxy.upgrade(req, socket as never, head);
  });
  new Logger('AgentProxy').log(`/agent-socket → ${target}`);
}
