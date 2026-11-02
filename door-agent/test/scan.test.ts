import { describe, it, type TestContext } from 'node:test';
import assert from 'node:assert/strict';
import { once } from 'events';
import type { AddressInfo } from 'net';
import { startHttpScanServer, type HttpScanServerOptions } from '../src/scan/http-scan-server';
import { ScanHandler } from '../src/scan/scan-handler';
import type { AccessDecision } from '../src/types/contracts';
import { captureLogger } from './helpers/capture-logger';
import { close } from './helpers/net';

const AT = '2026-11-02T08:00:00.000Z';
const granted: AccessDecision = {
  granted: true,
  door: { id: 'door-main', name: 'Entrée' },
  member: { id: 'm1', fullName: 'Sami Ben Ali', memberCode: 'MEL-00001', validUntil: '2026-12-31' },
  at: AT,
};
const refused: AccessDecision = { granted: false, reason: 'QR code invalide.', at: AT };

function scanHandler(resolveDoor: (requested: string | null) => string | null = (requested) => requested ?? 'door-main') {
  const { logger, entries } = captureLogger();
  const verified: [doorId: string, code: string][] = [];
  const handler = new ScanHandler(
    async (doorId, code) => {
      verified.push([doorId, code]);
      return code.startsWith('MLR1.') ? { ...granted } : { ...refused };
    },
    resolveDoor,
    logger,
  );
  return { handler, verified, entries };
}

describe('ScanHandler', () => {
  it('refuses locally when no door can be resolved', async () => {
    const { handler, verified } = scanHandler(() => null);
    const decision = await handler.handle('MLR1.MEL-00001.1.abc');
    assert.equal(decision.granted, false);
    assert.match(decision.reason ?? '', /DEFAULT_DOOR_ID/);
    assert.deepEqual(verified, []);
  });

  it('checks the code for the requested door, or the default one', async () => {
    const { handler, verified } = scanHandler();
    await handler.handle('MLR1.A', 'door-2');
    await handler.handle('MLR1.B');
    assert.deepEqual(verified, [
      ['door-2', 'MLR1.A'],
      ['door-main', 'MLR1.B'],
    ]);
  });

  it('a double read within 3 s is verified once and gets the same answer', async () => {
    const { handler, verified } = scanHandler();
    const [first, second] = await Promise.all([handler.handle(' MLR1.A \n'), handler.handle('MLR1.A')]);
    assert.equal(first, second);
    assert.deepEqual(verified, [['door-main', 'MLR1.A']]);
  });

  it('the same code at another door, or after the window, is verified again', async (t) => {
    let now = 1_000_000;
    t.mock.method(Date, 'now', () => now);
    const { handler, verified } = scanHandler();
    await handler.handle('MLR1.A', 'door-1');
    await handler.handle('MLR1.A', 'door-2');
    now += 2999;
    await handler.handle('MLR1.A', 'door-1');
    now += 2;
    await handler.handle('MLR1.A', 'door-1');
    assert.deepEqual(verified, [
      ['door-1', 'MLR1.A'],
      ['door-2', 'MLR1.A'],
      ['door-1', 'MLR1.A'],
    ]);
  });

  it('logs accepted codes as info and refused ones as warnings', async () => {
    const { handler, entries } = scanHandler();
    await handler.handle('MLR1.A');
    await handler.handle('BAD');
    assert.deepEqual(
      entries.map(({ level, msg, member, reason }) => ({ level, msg, member, reason })),
      [
        { level: 'info', msg: 'QR accepted', member: 'Sami Ben Ali', reason: undefined },
        { level: 'warn', msg: 'QR refused', member: undefined, reason: 'QR code invalide.' },
      ],
    );
  });
});

/** Local scan endpoint on 127.0.0.1 with an OS-assigned port. */
async function scanServer(t: TestContext, options: Partial<HttpScanServerOptions> = {}) {
  const { logger, entries } = captureLogger();
  const scans: { code: string; doorId: string | null }[] = [];
  const server = startHttpScanServer({
    host: '127.0.0.1',
    port: 0,
    token: null,
    onScan: async (code, doorId) => {
      scans.push({ code, doorId });
      return code.startsWith('MLR1.') ? granted : refused;
    },
    status: () => ({ connected: true, pendingEvents: 2 }),
    logger,
    ...options,
  });
  await once(server, 'listening');
  t.after(() => {
    server.closeAllConnections();
    return close(server);
  });
  const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  const post = (body: string, headers: Record<string, string> = {}) => fetch(`${base}/scan`, { method: 'POST', body, headers });
  return { base, post, scans, entries };
}

describe('local scan endpoint', { concurrency: true }, () => {
  it('GET /health returns the agent status', async (t) => {
    const { base } = await scanServer(t);
    const response = await fetch(`${base}/health`);
    assert.equal(response.status, 200);
    assert.deepEqual(await response.json(), { connected: true, pendingEvents: 2 });
  });

  it('answers 404 to anything but POST /scan and GET /health', async (t) => {
    const { base, scans } = await scanServer(t);
    for (const [method, route] of [
      ['GET', '/scan'],
      ['POST', '/open'],
      ['POST', '/scan?door=x'],
      ['DELETE', '/health'],
    ]) {
      const response = await fetch(`${base}${route}`, { method });
      assert.equal(response.status, 404, `${method} ${route}`);
    }
    assert.deepEqual(scans, []);
  });

  it('JSON body: 200 when granted with the decision, the code trimmed and the door passed on', async (t) => {
    const { post, scans } = await scanServer(t);
    const response = await post(JSON.stringify({ code: ' MLR1.MEL-00001.1.abc ', doorId: 'door-2' }), { 'Content-Type': 'application/json' });
    assert.equal(response.status, 200);
    assert.deepEqual(await response.json(), granted);
    assert.deepEqual(scans, [{ code: 'MLR1.MEL-00001.1.abc', doorId: 'door-2' }]);
  });

  it('raw text body: the whole body is the code, no door', async (t) => {
    const { post, scans } = await scanServer(t);
    const response = await post('MLR1.MEL-00001.1.abc\r\n', { 'Content-Type': 'text/plain' });
    assert.equal(response.status, 200);
    assert.deepEqual(scans, [{ code: 'MLR1.MEL-00001.1.abc', doorId: null }]);
  });

  it('403 with the reason when refused; an empty doorId means the default door', async (t) => {
    const { post, scans } = await scanServer(t);
    const response = await post(JSON.stringify({ code: 'EXPIRED', doorId: '' }));
    assert.equal(response.status, 403);
    assert.deepEqual(await response.json(), refused);
    assert.deepEqual(scans, [{ code: 'EXPIRED', doorId: null }]);
  });

  it('400 for broken JSON, a missing code or a code longer than 512 characters', async (t) => {
    const { post, scans } = await scanServer(t);
    const cases: [body: string, error: string][] = [
      ['{"code": "MLR1.', 'Invalid JSON'],
      ['{"doorId": "door-2"}', 'Missing or invalid "code"'],
      ['{"code": 42}', 'Missing or invalid "code"'],
      ['   ', 'Missing or invalid "code"'],
      [JSON.stringify({ code: `MLR1.${'x'.repeat(508)}` }), 'Missing or invalid "code"'],
    ];
    for (const [body, error] of cases) {
      const response = await post(body);
      assert.equal(response.status, 400, body.slice(0, 40));
      assert.deepEqual(await response.json(), { error });
    }
    assert.deepEqual(scans, []);
    assert.equal((await post(JSON.stringify({ code: `MLR1.${'x'.repeat(507)}` }))).status, 200, '512 characters are fine');
  });

  it('with a token, readers must send it in x-scan-token', async (t) => {
    const { post, scans } = await scanServer(t, { token: 'reader-secret' });
    const body = JSON.stringify({ code: 'MLR1.A' });
    const wrong: Record<string, string>[] = [{}, { 'x-scan-token': 'reader-secreT' }, { 'x-scan-token': 'short' }];
    for (const headers of wrong) {
      const response = await post(body, headers);
      assert.equal(response.status, 401, JSON.stringify(headers));
      assert.deepEqual(await response.json(), { error: 'Invalid scan token' });
    }
    assert.deepEqual(scans, []);
    assert.equal((await post(body, { 'x-scan-token': 'reader-secret' })).status, 200);
  });

  it('500 when the check itself fails, and the failure is logged', async (t) => {
    const { post, entries } = await scanServer(t, {
      onScan: async () => {
        throw new Error('socket closed');
      },
    });
    const response = await post('MLR1.A');
    assert.equal(response.status, 500);
    assert.deepEqual(await response.json(), { error: 'Scan failed' });
    assert.ok(entries.some((entry) => entry.level === 'error' && entry.msg === 'scan failed' && entry.error === 'socket closed'));
  });

  it('drops requests with a body over 4 KB without checking them', async (t) => {
    const { post, scans } = await scanServer(t);
    await assert.rejects(post(JSON.stringify({ code: 'MLR1.A', padding: 'x'.repeat(5000) })));
    assert.deepEqual(scans, []);
  });
});
