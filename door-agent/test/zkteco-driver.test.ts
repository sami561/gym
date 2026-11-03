import { after, before, describe, it, mock, type TestContext } from 'node:test';
import assert from 'node:assert/strict';
import * as fs from 'fs';
import * as path from 'path';
import { ZK_TIMEOUT_MIN_MS } from '../src/config';
import { ZK_PRIVILEGE } from '../src/doors/zk-protocol';
import { parseZktecoConfig, ZktecoDriver } from '../src/doors/zkteco';
import type { DeviceUserSync } from '../src/types/contracts';
import { captureLogger } from './helpers/capture-logger';
import { encodeUser, FakeZkTerminal, punchFrame, ZK, type TerminalUser } from './helpers/fake-zk-terminal';
import { agentConfig, door, driverContext, tempDataDir } from './helpers/fixtures';
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
  /** Terminal of a previous driver (a restarted agent); a new one by default. */
  terminal?: FakeZkTerminal;
  /** DATA_DIR of a previous driver; a fresh one by default. */
  dataDir?: string;
}

/** Fake terminal + started driver, connected. timeoutMs well above 1 s: zkteco-js waits 1 s for CMD_DATA replies. */
async function connectedDriver(t: TestContext, options: Options = {}) {
  const terminal = options.terminal ?? (await FakeZkTerminal.start(options.users));
  const dataDir = options.dataDir ?? tempDataDir(t);
  const { logger, entries } = captureLogger();
  const ctx = driverContext(logger, agentConfig({ DATA_DIR: dataDir, ...options.env }));
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
    if (!options.terminal) await terminal.close();
  });
  await driver.start();
  await waitFor(() => ctx.hooks.connected.length > 0, 'the terminal connection');
  return { terminal, driver, ctx, entries, dataDir };
}

const staff: TerminalUser = { uid: 1, role: ZK_PRIVILEGE.ADMIN, password: '4321', name: 'Reception', card: 0, userId: '900' };

const managedFile = (dataDir: string) => path.join(dataDir, 'zkteco-users-door-zk.json');
const readManaged = (dataDir: string) => JSON.parse(fs.readFileSync(managedFile(dataDir), 'utf8'));

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

  it('open fails when the terminal refuses the unlock (CMD_ACK_ERROR), and keeps the connection', async (t) => {
    const { terminal, driver } = await connectedDriver(t);
    terminal.replies.set(ZK.UNLOCK, ZK.ACK_ERROR);
    await assert.rejects(driver.open(5), { message: 'Terminal did not confirm the unlock: the terminal answered CMD_ACK_ERROR (2001)' });
    assert.deepEqual(driver.status(), { status: 'ok' }, 'a refusal is not a lost connection');

    terminal.replies.delete(ZK.UNLOCK);
    await driver.open(5);
    assert.equal(terminal.connections, 1, 'no reconnection');
    assert.equal(terminal.payloads(ZK.UNLOCK).length, 2);
  });

  it('a punch arriving just before the answer is neither taken for it nor lost', async (t) => {
    const { terminal, driver, ctx } = await connectedDriver(t, { config: { realtime: true } });
    const at = new Date(2026, 10, 2, 9, 15, 0);
    terminal.preludes.set(ZK.UNLOCK, punchFrame('60', at));
    terminal.replies.set(ZK.UNLOCK, ZK.ACK_ERROR);
    await assert.rejects(driver.open(5), /CMD_ACK_ERROR/);

    terminal.replies.delete(ZK.UNLOCK);
    await driver.open(5);
    assert.deepEqual(
      ctx.hooks.punches.map((punch) => punch.event.deviceUserId),
      ['60'],
      'the same punch, resent, is forwarded once',
    );
  });

  it('an unanswered command fails the open, drops the connection and reconnects', async (t) => {
    const { terminal, driver } = await connectedDriver(t, { config: { timeoutMs: ZK_TIMEOUT_MIN_MS } });
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
      door({ id: 'door-zk', driver: 'ZKTECO', config: { ip: '127.0.0.1', port, timeoutMs: ZK_TIMEOUT_MIN_MS } }),
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

  it('are all forwarded when the terminal sends several in one packet', async (t) => {
    const { terminal, ctx } = await connectedDriver(t, { config: { realtime: true } });
    terminal.sendPunches([
      { userId: '50', at: new Date(2026, 10, 2, 9, 0, 0) },
      { userId: '51', at: new Date(2026, 10, 2, 9, 0, 1) },
      { userId: '52', at: new Date(2026, 10, 2, 9, 0, 2) },
    ]);
    await waitFor(() => ctx.hooks.punches.length >= 3, 'the three punches', 1000);
    assert.deepEqual(
      ctx.hooks.punches.map((punch) => punch.event.deviceUserId),
      ['50', '51', '52'],
    );
  });

  it('a punch cut across two socket reads is forwarded', async (t) => {
    const { terminal, ctx } = await connectedDriver(t, { config: { realtime: true } });
    const at = new Date(2026, 10, 2, 9, 30, 0);
    const frame = punchFrame('53', at);
    terminal.sendRaw(frame.subarray(0, 21));
    await new Promise((resolve) => setTimeout(resolve, 50));
    terminal.sendRaw(frame.subarray(21));
    await waitFor(() => ctx.hooks.punches.length === 1, 'the punch', 1000);
    assert.deepEqual(ctx.hooks.punches[0].event, { deviceUserId: '53', method: 'CARD', at: at.toISOString() });
  });

  it('are not forwarded with realtime: false', async (t) => {
    const { terminal, ctx } = await connectedDriver(t);
    assert.equal(terminal.payloads(ZK.REG_EVENT).length, 0, 'not subscribed');
    terminal.sendPunch('54', new Date(2026, 10, 2, 9, 45, 0));
    await new Promise((resolve) => setTimeout(resolve, 100));
    assert.deepEqual(ctx.hooks.punches, []);
  });
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

  it('a member with a 24-character name and a badge is not rewritten on every sync', async (t) => {
    const { terminal, driver } = await connectedDriver(t, {
      users: [{ uid: 2, role: 0, password: '', name: 'Rania Ben Hedi Ghannouch', card: 3_000_000_123, userId: '2' }],
    });
    const result = await driver.syncUsers([
      { deviceUid: 2, name: 'Rania Ben Hédi Ghannouchi-Trabelsi', cardNumber: '3000000123', active: true },
    ]);
    assert.equal(result.unchanged, 1);
    assert.equal(terminal.payloads(ZK.USER_WRQ).length, 0);
    assert.equal(terminal.payloads(ZK.REFRESH_DATA).length, 0);
  });

  it('a user created by hand on the terminal is left untouched when a member gets the same PIN', async (t) => {
    const installer: TerminalUser = { uid: 1, role: ZK_PRIVILEGE.ADMIN, password: '1234', name: 'Installer', card: 0, userId: '1' };
    const { terminal, driver, entries } = await connectedDriver(t, { users: [installer] });
    const result = await driver.syncUsers([{ deviceUid: 1, name: 'Sami Ben Ali', cardNumber: '12345', active: true }]);
    assert.deepEqual(terminal.user('1'), installer);
    assert.deepEqual(result, { created: 0, updated: 0, disabled: 0, deleted: 0, unchanged: 0, skipped: 1 });
    const warning = entries.find((entry) => entry.level === 'warn' && String(entry.msg).startsWith('members skipped'));
    assert.deepEqual(warning?.users, [{ deviceUserId: '1', name: 'Installer', admin: true }]);
  });

  it('a plain user made by hand with a member PIN is never taken over, even when the member expires', async (t) => {
    const cleaner: TerminalUser = { uid: 4, role: 0, password: '', name: 'Menage', card: 555, userId: '4' };
    const { terminal, driver } = await connectedDriver(t, { users: [cleaner], env: { INACTIVE_POLICY: 'delete' } });
    assert.equal((await driver.syncUsers([{ deviceUid: 4, name: 'Sami Ben Ali', cardNumber: '12345', active: true }])).skipped, 1);
    assert.equal((await driver.syncUsers([{ deviceUid: 4, name: 'Sami Ben Ali', cardNumber: null, active: false }])).skipped, 1);
    assert.deepEqual(terminal.users(), [cleaner]);
    assert.equal(terminal.payloads(ZK.USER_WRQ).length + terminal.payloads(ZK.DELETE_USER).length, 0);
  });

  it('keeps managing the members it enrolled, after a rename and after a restart', async (t) => {
    const first = await connectedDriver(t);
    const karim: DeviceUserSync = { deviceUid: 3, name: 'Karim J.', cardNumber: null, active: true };
    assert.equal((await first.driver.syncUsers([karim])).created, 1);
    assert.deepEqual(readManaged(first.dataDir), { version: 1, doorId: 'door-zk', pins: ['3'] });
    await first.driver.stop();

    // Name changed and no badge: only the list kept in DATA_DIR says the user is the agent's.
    const second = await connectedDriver(t, { terminal: first.terminal, dataDir: first.dataDir });
    const result = await second.driver.syncUsers([{ ...karim, name: 'Karim Jaziri', active: false }]);
    assert.deepEqual(result, { created: 0, updated: 0, disabled: 1, deleted: 0, unchanged: 0, skipped: 0 });
    assert.deepEqual(first.terminal.user('3'), { uid: 3, role: ZK_PRIVILEGE.DISABLED, password: '', name: 'Karim Jaziri', card: 0, userId: '3' });
    await second.driver.stop(); // before the shared terminal closes
  });

  it('a member user promoted on the terminal, or deleted there and replaced by hand, is no longer modified', async (t) => {
    const { terminal, driver, dataDir } = await connectedDriver(t);
    const members: DeviceUserSync[] = [
      { deviceUid: 5, name: 'Coach Ali', cardNumber: null, active: true },
      { deviceUid: 6, name: 'Rania Trabelsi', cardNumber: null, active: true },
    ];
    assert.equal((await driver.syncUsers(members)).created, 2);
    const coach = terminal.user('5')!;
    terminal.slots.set(coach.uid, encodeUser({ ...coach, role: ZK_PRIVILEGE.ADMIN })); // promoted on the terminal
    terminal.slots.delete(terminal.user('6')!.uid); // deleted on the terminal...

    const expired = members.map((member) => ({ ...member, active: false }));
    assert.equal((await driver.syncUsers(expired)).skipped, 1);
    assert.deepEqual(readManaged(dataDir).pins, ['5'], 'the deleted user is forgotten');
    const reception: TerminalUser = { uid: 6, role: 0, password: '', name: 'Accueil', card: 0, userId: '6' };
    terminal.slots.set(6, encodeUser(reception)); // ...and its PIN reused by hand

    assert.equal((await driver.syncUsers(expired)).skipped, 2);
    assert.deepEqual(terminal.user('5'), { ...coach, role: ZK_PRIVILEGE.ADMIN });
    assert.deepEqual(terminal.user('6'), reception);
  });

  it('first sync after an upgrade: members written by the earlier version are taken over, nameless ones included', async (t) => {
    const { terminal, driver, entries, dataDir } = await connectedDriver(t, {
      users: [
        { uid: 2, role: 0, password: '', name: '', card: 0, userId: '2' }, // name in Arabic letters only
        { uid: 3, role: 0, password: '', name: 'Rania Trabelsi', card: 0, userId: '3' },
      ],
    });
    const result = await driver.syncUsers([
      { deviceUid: 2, name: 'محمد علي', cardNumber: null, active: false },
      { deviceUid: 3, name: 'Rania Trabelsi', cardNumber: null, active: false },
    ]);
    assert.deepEqual(result, { created: 0, updated: 0, disabled: 2, deleted: 0, unchanged: 0, skipped: 0 });
    assert.deepEqual(
      terminal.users().map((user) => user.role),
      [ZK_PRIVILEGE.DISABLED, ZK_PRIVILEGE.DISABLED],
    );
    assert.deepEqual(readManaged(dataDir).pins, ['2', '3']);
    assert.ok(entries.some((entry) => entry.msg === 'terminal users recognised as members, now kept in sync' && entry.count === 2));
  });

  it('a nameless user made by hand on a terminal never synced before is left alone', async (t) => {
    const keypadUser: TerminalUser = { uid: 2, role: 0, password: '', name: '', card: 0, userId: '2' };
    const { terminal, driver, dataDir } = await connectedDriver(t, { users: [keypadUser] });
    const result = await driver.syncUsers([{ deviceUid: 2, name: 'محمد علي', cardNumber: null, active: false }]);
    assert.equal(result.skipped, 1);
    assert.deepEqual(terminal.users(), [keypadUser]);
    assert.deepEqual(readManaged(dataDir), { version: 1, doorId: 'door-zk', pins: [] }, 'later syncs are no longer the first');
  });

  it('an unreadable list of managed users is rebuilt from the terminal', async (t) => {
    const dataDir = tempDataDir(t);
    fs.writeFileSync(managedFile(dataDir), '{"version":1,"pins":');
    const { driver, entries } = await connectedDriver(t, {
      dataDir,
      users: [{ uid: 7, role: 0, password: '', name: 'Sami Ben Ali', card: 0, userId: '7' }],
    });
    const result = await driver.syncUsers([{ deviceUid: 7, name: 'Sami Ben Ali', cardNumber: null, active: false }]);
    assert.equal(result.disabled, 1);
    assert.ok(entries.some((entry) => entry.level === 'warn' && entry.msg === 'managed terminal users unreadable, rebuilding the list'));
    assert.deepEqual(readManaged(dataDir), { version: 1, doorId: 'door-zk', pins: ['7'] });
  });

  it('refused user writes skip the member, keep the connection and the other members', async (t) => {
    const { terminal, driver, entries, dataDir } = await connectedDriver(t, {
      env: { INACTIVE_POLICY: 'delete' },
      users: [{ uid: 2, role: 0, password: '', name: 'Rania Trabelsi', card: 0, userId: '2' }],
    });
    terminal.replies.set(ZK.USER_WRQ, ZK.ACK_ERROR); // e.g. the terminal is full
    terminal.replies.set(ZK.DELETE_USER, ZK.ACK_ERROR);
    const result = await driver.syncUsers([
      { deviceUid: 1, name: 'Sami Ben Ali', cardNumber: null, active: true },
      { deviceUid: 2, name: 'Rania Trabelsi', cardNumber: null, active: false },
    ]);
    assert.deepEqual(result, { created: 0, updated: 0, disabled: 0, deleted: 0, unchanged: 0, skipped: 2 });
    assert.deepEqual(driver.status(), { status: 'ok' });
    assert.equal(terminal.connections, 1);
    assert.equal(terminal.payloads(ZK.REFRESH_DATA).length, 0, 'nothing changed');
    assert.deepEqual(readManaged(dataDir).pins, ['2'], 'the refused creation is not recorded');
    const warning = entries.find((entry) => entry.msg === 'terminal refused member changes');
    assert.deepEqual(warning?.changes, [
      { deviceUserId: '1', change: 'create', reply: 'CMD_ACK_ERROR (2001)' },
      { deviceUserId: '2', change: 'delete', reply: 'CMD_ACK_ERROR (2001)' },
    ]);
  });

  it('a user list cut short fails the sync without writing anything', async (t) => {
    const { terminal, driver } = await connectedDriver(t, { users: [staff] });
    terminal.truncateUserList = true; // staff missing: its slot would look free
    await assert.rejects(
      driver.syncUsers([{ deviceUid: 1, name: 'Sami Ben Ali', cardNumber: null, active: true }]),
      /Incomplete user list from the terminal \(0 of 72 bytes\)/,
    );
    assert.equal(terminal.payloads(ZK.USER_WRQ).length, 0);
    assert.deepEqual(terminal.users(), [staff]);
  });

  it(`works with the shortest timeout the configuration accepts (${ZK_TIMEOUT_MIN_MS} ms)`, async (t) => {
    const defaults = { timeoutMs: 5000, inport: 5200 };
    assert.equal(parseZktecoConfig({ ip: 'x', timeoutMs: ZK_TIMEOUT_MIN_MS }, defaults).timeoutMs, ZK_TIMEOUT_MIN_MS);
    assert.equal(parseZktecoConfig({ ip: 'x', timeoutMs: 1000 }, defaults).timeoutMs, 5000, 'too short for zkteco-js: the default');

    const { driver } = await connectedDriver(t, { config: { timeoutMs: ZK_TIMEOUT_MIN_MS } });
    const result = await driver.syncUsers([{ deviceUid: 1, name: 'Sami Ben Ali', cardNumber: null, active: true }]);
    assert.equal(result.created, 1);
  });

  it('a door timeout below the minimum is replaced by the default, with a warning', async (t) => {
    const { entries } = await connectedDriver(t, { config: { timeoutMs: 800 } });
    assert.ok(entries.some((entry) => entry.msg === 'ignoring config.timeoutMs' && entry.timeoutMs === 800 && entry.using === 5000));
  });
});
