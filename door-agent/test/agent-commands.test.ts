import { after, before, describe, it, mock, type TestContext } from 'node:test';
import assert from 'node:assert/strict';
import * as fs from 'fs';
import * as http from 'http';
import * as os from 'os';
import * as path from 'path';
import { DoorAgent } from '../src/agent';
import { FakeAccessService } from './helpers/access-service';
import { captureLogger } from './helpers/capture-logger';
import { FakeZkTerminal, ZK } from './helpers/fake-zk-terminal';
import { agentConfig, door } from './helpers/fixtures';
import { close, freePort, listen, waitFor } from './helpers/net';

// zkteco-js prints every step and error to the console
before(() => {
  mock.method(console, 'log', () => undefined);
  mock.method(console, 'error', () => undefined);
});
after(() => mock.restoreAll());

type Defer = (cleanup: () => unknown) => void;

/** Cleanups run in reverse order when the test ends, so the agent stops before the servers it talks to. */
function cleanupStack(t: TestContext): Defer {
  const stack: (() => unknown)[] = [];
  t.after(async () => {
    for (const cleanup of stack.reverse()) await cleanup();
  });
  return (cleanup) => stack.push(cleanup);
}

/** Starts a DoorAgent with its own DATA_DIR, optionally holding punches saved by a previous run. */
function startAgent(defer: Defer, env: Record<string, string>, pending?: object[]) {
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'door-agent-data-'));
  defer(() => fs.rmSync(dataDir, { recursive: true, force: true }));
  if (pending) fs.writeFileSync(path.join(dataDir, 'pending-events.json'), JSON.stringify(pending));
  const { logger, entries } = captureLogger();
  const agent = new DoorAgent(agentConfig({ DATA_DIR: dataDir, ...env }), logger, '9.9.9-test');
  agent.start();
  defer(() => agent.stop());
  return { agent, dataDir, entries };
}

/** Relay on 127.0.0.1: /fail answers 503, anything else 200. */
async function startRelay(defer: Defer) {
  const urls: string[] = [];
  const server = http.createServer((req, res) => {
    urls.push(req.url ?? '');
    res.writeHead(req.url?.startsWith('/fail') ? 503 : 200);
    res.end(req.url?.startsWith('/fail') ? 'relay busy' : '{"was_on":false}');
  });
  const base = `http://127.0.0.1:${await listen(server)}`;
  defer(() => {
    server.closeAllConnections();
    return close(server);
  });
  return { base, urls };
}

async function health(base: string): Promise<Record<string, unknown>> {
  const deadline = Date.now() + 5000;
  for (;;) {
    try {
      return (await (await fetch(`${base}/health`)).json()) as Record<string, unknown>;
    } catch (err) {
      if (Date.now() > deadline) throw err;
      await new Promise((resolve) => setTimeout(resolve, 20));
    }
  }
}

describe('DoorAgent with the access-service', { concurrency: true }, () => {
  it('answers every door.open: opened, failed, unknown, disabled or invalid', async (t) => {
    const defer = cleanupStack(t);
    const service = await FakeAccessService.start();
    defer(() => service.close());
    const relay = await startRelay(defer);
    const unpluggedTerminal = await freePort();
    startAgent(defer, { SERVER_URL: service.url });

    await waitFor(() => service.heartbeats[0], 'the first heartbeat');
    assert.deepEqual(service.heartbeats[0], { version: '9.9.9-test', doors: [] });

    const heartbeat = await service.pushDoors([
      door({ id: 'door-sim', name: 'Entrée (simulation)' }),
      door({ id: 'door-relay', driver: 'HTTP_RELAY', config: { url: `${relay.base}/ok?toggle_after={seconds}` }, unlockSeconds: 4 }),
      door({ id: 'door-relay-down', driver: 'HTTP_RELAY', config: { url: `${relay.base}/fail` } }),
      door({ id: 'door-off', name: 'Sortie de secours', isActive: false }),
      door({ id: 'door-zk', driver: 'ZKTECO', config: { ip: '127.0.0.1', port: unpluggedTerminal, timeoutMs: 600 } }),
    ]);
    assert.deepEqual(heartbeat.doors.find((status) => status.id === 'door-off'), { id: 'door-off', status: 'ok' });
    assert.equal(heartbeat.doors.find((status) => status.id === 'door-zk')?.status, 'error');

    assert.deepEqual(await service.openDoor({ requestId: 'r1', doorId: 'door-sim', seconds: 3 }), { ok: true });
    assert.deepEqual(await service.openDoor({ requestId: 'r2', doorId: 'door-relay' }), { ok: true });
    assert.deepEqual(relay.urls, ['/ok?toggle_after=4'], 'no duration in the command: the door unlock time');
    assert.deepEqual(await service.openDoor({ requestId: 'r3', doorId: 'door-relay-down', seconds: 3 }), {
      ok: false,
      error: 'Relay answered HTTP 503: relay busy',
    });
    assert.deepEqual(await service.openDoor({ requestId: 'r4', doorId: 'door-unknown', seconds: 3 }), {
      ok: false,
      error: 'Door door-unknown is not managed by this agent',
    });
    assert.deepEqual(await service.openDoor({ requestId: 'r5', doorId: 'door-off', seconds: 3 }), {
      ok: false,
      error: 'Door "Sortie de secours" is disabled',
    });
    const zk = await service.openDoor({ requestId: 'r6', doorId: 'door-zk', seconds: 3 });
    assert.equal(zk.ok, false);
    assert.match(zk.error ?? '', new RegExp(`^Terminal 127\\.0\\.0\\.1:${unpluggedTerminal} unreachable`));
    for (const invalid of [null, { requestId: 'r7' }, { requestId: 'r8', doorId: 42 }]) {
      assert.deepEqual(await service.openDoor(invalid), { ok: false, error: 'Invalid command' }, JSON.stringify(invalid));
    }
  });

  it('delivers the punches kept on disk as soon as it connects, oldest door first', async (t) => {
    const defer = cleanupStack(t);
    const service = await FakeAccessService.start();
    defer(() => service.close());
    const { agent, dataDir } = startAgent(defer, { SERVER_URL: service.url }, [
      { doorId: 'door-b', deviceUserId: '7', method: 'CARD', at: '2026-11-02T07:58:00.000Z' },
      { doorId: 'door-a', deviceUserId: '8', method: 'FINGERPRINT', at: '2026-11-02T07:59:00.000Z' },
      { doorId: 'door-b', deviceUserId: '9', method: 'CARD', at: '2026-11-02T08:00:00.000Z' },
    ]);

    await waitFor(() => service.deviceEvents.length === 2, 'both batches');
    assert.deepEqual(service.deviceEvents, [
      {
        doorId: 'door-b',
        events: [
          { deviceUserId: '7', method: 'CARD', at: '2026-11-02T07:58:00.000Z' },
          { deviceUserId: '9', method: 'CARD', at: '2026-11-02T08:00:00.000Z' },
        ],
      },
      { doorId: 'door-a', events: [{ deviceUserId: '8', method: 'FINGERPRINT', at: '2026-11-02T07:59:00.000Z' }] },
    ]);
    await waitFor(() => agent.status().pendingEvents === 0, 'the buffer to empty');

    await agent.stop();
    assert.deepEqual(JSON.parse(fs.readFileSync(path.join(dataDir, 'pending-events.json'), 'utf8')), []);
  });

  it('enrols the members on a ZKTeco terminal, unlocks it and forwards its punches', async (t) => {
    const defer = cleanupStack(t);
    const terminal = await FakeZkTerminal.start();
    defer(() => terminal.close());
    const service = await FakeAccessService.start();
    defer(() => service.close());
    service.members = [
      { deviceUid: 7, name: 'Sami Ben Ali', cardNumber: '3000000123', active: true },
      { deviceUid: 8, name: 'Rania Trabelsi', cardNumber: null, active: false },
    ];
    startAgent(defer, { SERVER_URL: service.url });

    await service.pushDoors([door({ id: 'door-zk', driver: 'ZKTECO', config: { ip: '127.0.0.1', port: terminal.port, timeoutMs: 2500 } })]);
    await waitFor(() => terminal.payloads(ZK.REFRESH_DATA).length === 1, 'the member sync', 10_000);
    assert.equal(service.memberSyncRequests, 1);
    assert.deepEqual(terminal.users(), [{ uid: 7, role: 0, password: '', name: 'Sami Ben Ali', card: 3_000_000_123, userId: '7' }]);

    assert.deepEqual(await service.openDoor({ requestId: 'r1', doorId: 'door-zk', seconds: 5 }), { ok: true });
    assert.deepEqual([...terminal.payloads(ZK.UNLOCK)[0]], [50, 0, 0, 0]);

    const at = new Date(2026, 10, 2, 8, 30, 15);
    terminal.sendPunch('7', at);
    await waitFor(() => service.deviceEvents.length === 1, 'the punch on the server');
    assert.deepEqual(service.deviceEvents[0], { doorId: 'door-zk', events: [{ deviceUserId: '7', method: 'CARD', at: at.toISOString() }] });
  });
});

// Not concurrent: the server port is reserved first and bound later.
describe('DoorAgent while the access-service is unreachable', () => {
  it('refuses QR codes, keeps the punches, then reconnects by itself and replays them', async (t) => {
    const defer = cleanupStack(t);
    const serverPort = await freePort();
    const scanPort = await freePort();
    const { agent } = startAgent(
      defer,
      {
        SERVER_URL: `http://127.0.0.1:${serverPort}`,
        LOCAL_SCAN_PORT: String(scanPort),
        LOCAL_SCAN_HOST: '127.0.0.1',
        DEFAULT_DOOR_ID: 'door-main',
      },
      [{ doorId: 'door-main', deviceUserId: '12', method: 'CARD', at: '2026-11-02T07:00:00.000Z' }],
    );
    const scanBase = `http://127.0.0.1:${scanPort}`;
    const scan = (code: string) => fetch(`${scanBase}/scan`, { method: 'POST', body: JSON.stringify({ code }) });

    const offlineStatus = await health(scanBase);
    assert.equal(offlineStatus.connected, false);
    assert.equal(offlineStatus.pendingEvents, 1);
    const refused = await scan('MLR1.MEL-00001.1.aaa');
    assert.equal(refused.status, 403);
    assert.match((await refused.json()).reason, /^Serveur injoignable/);

    const service = await FakeAccessService.start(serverPort);
    defer(() => service.close());
    defer(() => agent.stop()); // before the service closes
    await waitFor(() => service.deviceEvents.length === 1, 'the punch kept while offline', 10_000);
    assert.deepEqual(service.deviceEvents, [
      { doorId: 'door-main', events: [{ deviceUserId: '12', method: 'CARD', at: '2026-11-02T07:00:00.000Z' }] },
    ]);
    await waitFor(() => agent.status().connected === true && agent.status().pendingEvents === 0, 'the agent back online');

    const accepted = await scan('MLR1.MEL-00001.2.bbb');
    assert.equal(accepted.status, 200);
    assert.deepEqual(service.qrScans, [{ doorId: 'door-main', code: 'MLR1.MEL-00001.2.bbb' }]);
  });
});
