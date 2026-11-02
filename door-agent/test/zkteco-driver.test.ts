import { after, before, describe, it, mock, type TestContext } from 'node:test';
import assert from 'node:assert/strict';
import { ZK_PRIVILEGE } from '../src/doors/zk-protocol';
import { ZktecoDriver } from '../src/doors/zkteco';
import type { DeviceUserSync } from '../src/types/contracts';
import { captureLogger } from './helpers/capture-logger';
import { FakeZkTerminal, ZK, type TerminalUser } from './helpers/fake-zk-terminal';
import { agentConfig, door, driverContext } from './helpers/fixtures';
import { freePort, waitFor } from './helpers/net';

// zkteco-js prints every step and error to the console
before(() => {
  mock.method(console, 'log', () => undefined);
  mock.method(console, 'error', () => undefined);
});
after(() => mock.restoreAll());

interface Options {
  users?: TerminalUser[];
  /** Door config on top of the fake terminal address. */
  config?: Record<string, unknown>;
  env?: Record<string, string>;
}

/** Fake terminal + started driver, connected. timeoutMs well above 1 s: zkteco-js waits 1 s for CMD_DATA replies. */
async function connectedDriver(t: TestContext, options: Options = {}) {
  const terminal = await FakeZkTerminal.start(options.users);
  const { logger, entries } = captureLogger();
  const ctx = driverContext(logger, agentConfig(options.env));
  const driver = new ZktecoDriver(
    door({
      id: 'door-zk',
      driver: 'ZKTECO',
      config: { ip: '127.0.0.1', port: terminal.port, timeoutMs: 2500, realtime: false, ...options.config },
    }),
    ctx,
  );
  t.after(async () => {
    await driver.stop();
    await terminal.close();
  });
  await driver.start();
  await waitFor(() => ctx.hooks.connected.length > 0, 'the terminal connection');
  return { terminal, driver, ctx, entries };
}

const staff: TerminalUser = { uid: 1, role: ZK_PRIVILEGE.ADMIN, password: '4321', name: 'Reception', card: 0, userId: '900' };

// Every test has its own terminal and driver, so they run concurrently.
describe('ZktecoDriver', { concurrency: true }, () => {
  it('connects, reports ok and announces the connection', async (t) => {
    const { terminal, driver, ctx } = await connectedDriver(t);
    assert.deepEqual(driver.status(), { status: 'ok' });
    assert.deepEqual(ctx.hooks.connected, ['door-zk']);
    assert.equal(terminal.received[0].command, ZK.CONNECT);
  });

  it('open sends CMD_UNLOCK (31) with the duration in tenths of a second, uint32 LE', async (t) => {
    const { terminal, driver } = await connectedDriver(t);
    await driver.open(5);
    await driver.open(26);
    await driver.open(90); // capped at 60 s
    assert.deepEqual(
      terminal.payloads(ZK.UNLOCK).map((payload) => [...payload]),
      [
        [50, 0, 0, 0],
        [4, 1, 0, 0],
        [88, 2, 0, 0],
      ],
    );
  });

  it(
    'open fails when the terminal refuses the unlock (CMD_ACK_ERROR)',
    {
      todo:
        'BUG src/doors/zkteco.ts: zkteco-js resolves executeCmd on any reply and open() never checks for CMD_ACK_OK (2000), ' +
        'so a refused unlock is logged as done and acked { ok: true } to the server',
    },
    async (t) => {
      const { terminal, driver } = await connectedDriver(t);
      terminal.replies.set(ZK.UNLOCK, ZK.ACK_ERROR);
      await assert.rejects(driver.open(5), /did not confirm the unlock/);
    },
  );

  it('an unanswered command fails the open, drops the connection and reconnects', async (t) => {
    const { terminal, driver } = await connectedDriver(t, { config: { timeoutMs: 600 } });
    terminal.replies.set(ZK.UNLOCK, null);
    await assert.rejects(driver.open(3), /Terminal did not confirm the unlock/);
    assert.equal(driver.status().status, 'error');

    terminal.replies.delete(ZK.UNLOCK);
    await waitFor(() => terminal.connections === 2 && driver.status().status === 'ok', 'the reconnection');
    await driver.open(3);
    assert.equal(terminal.payloads(ZK.UNLOCK).length, 2);
  });

  it('an unreachable terminal fails fast with its address and the cause', async (t) => {
    const port = await freePort();
    const driver = new ZktecoDriver(
      door({ id: 'door-zk', driver: 'ZKTECO', config: { ip: '127.0.0.1', port, timeoutMs: 600 } }),
      driverContext(captureLogger().logger),
    );
    t.after(() => driver.stop());
    await assert.rejects(driver.open(3), new RegExp(`Terminal 127\\.0\\.0\\.1:${port} unreachable \\(.*ECONNREFUSED`));
    assert.match(driver.status().error ?? '', /ECONNREFUSED/);
  });

  it('a door without an IP never connects and explains why', async () => {
    const { logger, entries } = captureLogger();
    const driver = new ZktecoDriver(door({ id: 'door-zk', driver: 'ZKTECO', config: {} }), driverContext(logger));
    await driver.start();
    assert.deepEqual(driver.status(), { status: 'error', error: 'ZKTECO door needs config.ip (e.g. "192.168.1.201")' });
    assert.ok(entries.some((entry) => entry.level === 'error' && entry.msg === 'invalid ZKTeco configuration'));
    await assert.rejects(driver.open(3), /needs config\.ip/);
  });

  it('syncUsers: false skips every member without contacting the terminal', async () => {
    const port = await freePort(); // nothing listens there
    const driver = new ZktecoDriver(
      door({ id: 'exit-reader', driver: 'ZKTECO', config: { ip: '127.0.0.1', port, syncUsers: false } }),
      driverContext(captureLogger().logger),
    );
    const result = await driver.syncUsers([
      { deviceUid: 1, name: 'Sami Ben Ali', cardNumber: null, active: true },
      { deviceUid: 2, name: 'Rania Trabelsi', cardNumber: null, active: false },
    ]);
    assert.deepEqual(result, { created: 0, updated: 0, disabled: 0, deleted: 0, unchanged: 0, skipped: 2 });
  });

  it('stop says goodbye to the terminal and refuses later commands', async (t) => {
    const { terminal, driver } = await connectedDriver(t);
    await driver.stop();
    assert.equal(terminal.received.at(-1)?.command, ZK.EXIT);
    assert.equal(driver.status().status, 'error');
    await assert.rejects(driver.open(3), /Door driver stopped/);
  });
});

describe('live punches', { concurrency: true }, () => {
  it('are forwarded once, with the configured method and the terminal local time', async (t) => {
    const { terminal, ctx } = await connectedDriver(t, { config: { realtime: true, punchMethod: 'fingerprint' } });
    assert.deepEqual([...terminal.payloads(ZK.REG_EVENT)[0]], [1, 0, 0, 0]);
    const at = new Date(2026, 10, 2, 8, 30, 15);

    terminal.sendPunch('42', at);
    await waitFor(() => ctx.hooks.punches.length === 1, 'the first punch');
    terminal.sendPunch('42', at); // terminals resend events they think were missed
    await new Promise((resolve) => setTimeout(resolve, 100));
    terminal.sendPunch('43', at);
    await waitFor(() => ctx.hooks.punches.length >= 2, 'the second punch');

    assert.deepEqual(ctx.hooks.punches, [
      { doorId: 'door-zk', event: { deviceUserId: '42', method: 'FINGERPRINT', at: at.toISOString() } },
      { doorId: 'door-zk', event: { deviceUserId: '43', method: 'FINGERPRINT', at: at.toISOString() } },
    ]);
  });

  it(
    'are all forwarded when the terminal sends several in one packet',
    {
      todo:
        'BUG src/doors/zkteco.ts: zkteco-js getRealTimeLogs decodes one event per TCP read, ' +
        'so a burst of badges read together loses every punch after the first',
    },
    async (t) => {
      const { terminal, ctx } = await connectedDriver(t, { config: { realtime: true } });
      terminal.sendPunches([
        { userId: '50', at: new Date(2026, 10, 2, 9, 0, 0) },
        { userId: '51', at: new Date(2026, 10, 2, 9, 0, 1) },
      ]);
      await waitFor(() => ctx.hooks.punches.length >= 2, 'both punches', 1000);
    },
  );
});

describe('member sync', { concurrency: true }, () => {
  it('enrols active members, disables expired ones, leaves terminal staff alone and is idempotent', async (t) => {
    const rania: TerminalUser = { uid: 2, role: 0, password: '', name: 'Rania Trabelsi', card: 0, userId: '2' };
    const { terminal, driver } = await connectedDriver(t, { users: [staff, rania] });
    const members: DeviceUserSync[] = [
      { deviceUid: 1, name: 'Sami Ben Ali', cardNumber: '3000000123', active: true }, // slot 1 is taken by staff
      { deviceUid: 2, name: 'Rania Trabelsi', cardNumber: null, active: false }, // expired: disabled, fingerprints kept
      { deviceUid: 3, name: 'Amine Gharbi', cardNumber: null, active: false }, // expired and never enrolled
      { deviceUid: 0, name: 'Broken', cardNumber: null, active: true }, // invalid PIN
    ];

    assert.deepEqual(await driver.syncUsers(members), { created: 1, updated: 0, disabled: 1, deleted: 0, unchanged: 1, skipped: 1 });
    assert.deepEqual(terminal.users(), [
      staff,
      { ...rania, role: ZK_PRIVILEGE.DISABLED },
      { uid: 3, role: 0, password: '', name: 'Sami Ben Ali', card: 3_000_000_123, userId: '1' },
    ]);
    assert.equal(terminal.payloads(ZK.REFRESH_DATA).length, 1);

    assert.deepEqual(await driver.syncUsers(members), { created: 0, updated: 0, disabled: 0, deleted: 0, unchanged: 3, skipped: 1 });
    assert.equal(terminal.payloads(ZK.USER_WRQ).length, 2, 'nothing rewritten');
    assert.equal(terminal.payloads(ZK.REFRESH_DATA).length, 1, 'no refresh when nothing changed');
  });

  it('updates renamed members and re-enables renewed ones', async (t) => {
    const { terminal, driver } = await connectedDriver(t, {
      users: [
        { uid: 5, role: ZK_PRIVILEGE.DISABLED, password: '', name: 'Rania Trabelsi', card: 0, userId: '2' },
        { uid: 6, role: 0, password: '77', name: 'Karim J.', card: 111, userId: '3' },
      ],
    });
    const result = await driver.syncUsers([
      { deviceUid: 2, name: 'Rania Trabelsi', cardNumber: '555', active: true },
      { deviceUid: 3, name: 'Karim Jaziri', cardNumber: '111', active: true },
    ]);
    assert.deepEqual(result, { created: 0, updated: 2, disabled: 0, deleted: 0, unchanged: 0, skipped: 0 });
    assert.deepEqual(terminal.users(), [
      { uid: 5, role: 0, password: '', name: 'Rania Trabelsi', card: 555, userId: '2' },
      { uid: 6, role: 0, password: '77', name: 'Karim Jaziri', card: 111, userId: '3' },
    ]);
  });

  it('with INACTIVE_POLICY=delete, expired members are removed from the terminal', async (t) => {
    const { terminal, driver } = await connectedDriver(t, {
      env: { INACTIVE_POLICY: 'delete' },
      users: [staff, { uid: 2, role: 0, password: '', name: 'Rania Trabelsi', card: 77, userId: '2' }],
    });
    const result = await driver.syncUsers([
      { deviceUid: 2, name: 'Rania Trabelsi', cardNumber: '77', active: false },
      { deviceUid: 4, name: 'Never Enrolled', cardNumber: null, active: false },
    ]);
    assert.deepEqual(result, { created: 0, updated: 0, disabled: 0, deleted: 1, unchanged: 1, skipped: 0 });
    assert.deepEqual(
      terminal.payloads(ZK.DELETE_USER).map((payload) => [...payload]),
      [[2, 0]],
    );
    assert.deepEqual(terminal.users(), [staff]);
    assert.equal(terminal.payloads(ZK.REFRESH_DATA).length, 1);
  });

  it(
    'a member with a 24-character name and a badge is not rewritten on every sync',
    {
      todo:
        'BUG src/doors/zkteco.ts: zkteco-js decodeUserData72 reads the name past its 24-byte field into the card number, ' +
        'so the unchanged check never matches and the user is rewritten (plus CMD_REFRESHDATA) on every sync',
    },
    async (t) => {
      const { terminal, driver } = await connectedDriver(t, {
        users: [{ uid: 2, role: 0, password: '', name: 'Rania Ben Hedi Ghannouch', card: 3_000_000_123, userId: '2' }],
      });
      const result = await driver.syncUsers([
        { deviceUid: 2, name: 'Rania Ben Hédi Ghannouchi-Trabelsi', cardNumber: '3000000123', active: true },
      ]);
      assert.equal(result.unchanged, 1);
      assert.equal(terminal.payloads(ZK.USER_WRQ).length, 0);
    },
  );

  it(
    'a user created by hand on the terminal is left untouched when a member gets the same PIN',
    {
      todo:
        'BUG src/doors/zkteco.ts (security): users are matched by PIN only and deviceUid starts at 1, so member #1 ' +
        'overwrites a hand-made admin with PIN 1 and keeps its admin privilege (14); the README says such users are never modified',
    },
    async (t) => {
      const installer: TerminalUser = { uid: 1, role: ZK_PRIVILEGE.ADMIN, password: '1234', name: 'Installer', card: 0, userId: '1' };
      const { terminal, driver } = await connectedDriver(t, { users: [installer] });
      await driver.syncUsers([{ deviceUid: 1, name: 'Sami Ben Ali', cardNumber: '12345', active: true }]);
      assert.deepEqual(terminal.user('1'), installer);
    },
  );

  it(
    'works with the shortest timeout the configuration accepts (500 ms)',
    {
      todo:
        'BUG src/doors/zkteco.ts / src/config.ts: zkteco-js resolves a CMD_DATA reply after a fixed 1 s while its own ' +
        'no-reply timer equals timeoutMs, so any timeoutMs <= 1000 makes every member sync fail',
    },
    async (t) => {
      const { driver } = await connectedDriver(t, { config: { timeoutMs: 500 } });
      const result = await driver.syncUsers([{ deviceUid: 1, name: 'Sami Ben Ali', cardNumber: null, active: true }]);
      assert.equal(result.created, 1);
    },
  );
});
