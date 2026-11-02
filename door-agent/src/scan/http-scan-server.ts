import * as http from 'http';
import { timingSafeEqual } from 'crypto';
import type { Logger } from '../logger';
import type { AccessDecision } from '../types/contracts';

export interface HttpScanServerOptions {
  host: string;
  port: number;
  token: string | null;
  onScan: (code: string, doorId: string | null) => Promise<AccessDecision>;
  status: () => Record<string, unknown>;
  logger: Logger;
}

/**
 * Local endpoint for network QR readers (ESP32 + GM65/GM805 module, Wiegand-to-HTTP bridges):
 *   POST /scan  {"code": "MLR1....", "doorId": "optional"}  (or the raw code as text/plain)
 *   → 200 granted · 403 refused · 400 bad request · 401 bad token
 *   GET /health → agent status
 */
export function startHttpScanServer(options: HttpScanServerOptions): http.Server {
  const server = http.createServer((req, res) => {
    const reply = (status: number, body: unknown) => {
      res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8' });
      res.end(JSON.stringify(body));
    };

    if (req.method === 'GET' && req.url === '/health') return reply(200, options.status());
    if (req.method !== 'POST' || req.url !== '/scan') return reply(404, { error: 'Not found' });

    if (options.token && !sameToken(String(req.headers['x-scan-token'] ?? ''), options.token)) {
      return reply(401, { error: 'Invalid scan token' });
    }

    let raw = '';
    req.setEncoding('utf8');
    req.on('data', (chunk: string) => {
      raw += chunk;
      if (raw.length > 4096) req.destroy();
    });
    req.on('end', async () => {
      let code = '';
      let doorId: string | null = null;
      const text = raw.trim();
      if (text.startsWith('{')) {
        try {
          const body = JSON.parse(text) as { code?: unknown; doorId?: unknown };
          code = typeof body.code === 'string' ? body.code.trim() : '';
          doorId = typeof body.doorId === 'string' && body.doorId ? body.doorId : null;
        } catch {
          return reply(400, { error: 'Invalid JSON' });
        }
      } else {
        code = text;
      }
      if (!code || code.length > 512) return reply(400, { error: 'Missing or invalid "code"' });
      try {
        const decision = await options.onScan(code, doorId);
        reply(decision.granted ? 200 : 403, decision);
      } catch (err) {
        options.logger.error('scan failed', { error: (err as Error).message });
        reply(500, { error: 'Scan failed' });
      }
    });
  });
  server.listen(options.port, options.host, () => {
    options.logger.info('local scan endpoint listening', { host: options.host, port: options.port });
  });
  server.on('error', (err) => options.logger.error('local scan endpoint error', { error: err.message }));
  return server;
}

function sameToken(provided: string, expected: string): boolean {
  const a = Buffer.from(provided);
  const b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}
