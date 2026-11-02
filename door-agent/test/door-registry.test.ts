import { describe, it, test } from 'node:test';
import assert from 'node:assert/strict';
import { sleep } from '../src/command-queue';
import type { DoorDriver, DriverFactory, DriverStatus, UserSyncResult } from '../src/doors/driver';
import { createDriver, DoorRegistry } from '../src/doors/registry';
import type { AgentDoorConfig, DeviceUserSync, DoorDriverKind } from '../src/types/contracts';
import { captureLogger } from './helpers/capture-logger';
import { door, driverContext } from './helpers/fixtures';

class FakeDriver implements DoorDriver {
  readonly opened: number[] = [];
  started = 0;
  stopped = 0;
  state: DriverStatus = { status: 'ok' };
  openError: Error | null = null;
  stopError: Error | null = null;
  syncUsers?: (users: DeviceUserSync[]) => Promise<UserSyncResult>;

  constructor(
    readonly kind: DoorDriverKind,
    readonly config: AgentDoorConfig,
  ) {}

  async start(): Promise<void> {
    await sleep(5);
    this.started++;
  }

  async stop(): Promise<void> {
    this.stopped++;
    if (this.stopError) throw this.stopError;
  }

  async open(seconds: number): Promise<void> {
    if (this.openError) throw this.openError;
    this.opened.push(seconds);
  }

  status(): DriverStatus {
    return this.state;
  }
}

const synced: UserSyncResult = { created: 1, updated: 0, disabled: 0, deleted: 0, unchanged: 0, skipped: 0 };

/** Registry whose factory builds fake drivers (ZKTECO ones store users, BROKEN cannot be built). */
function fakeRegistry() {
  const { logger, entries } = captureLogger();
  const drivers: FakeDriver[] = [];
  const factory: DriverFactory = (config) => {
    if (config.driver === ('BROKEN' as DoorDriverKind)) throw new Error('Unknown door driver BROKEN');
    const driver = new FakeDriver(config.driver, config);
    if (config.driver === 'ZKTECO') driver.syncUsers = async () => synced;
    drivers.push(driver);
    return driver;
  };
  const registry = new DoorRegistry(driverContext(logger), factory);
  const driverOf = (doorId: string) => drivers.filter((driver) => driver.config.id === doorId).at(-1)!;
  return { registry, drivers, driverOf, entries };
}

describe('DoorRegistry.open', () => {
  it('refuses doors this agent does not manage', async () => {
    const { registry } = fakeRegistry();
    await registry.apply([door({ id: 'door-main' })]);
    await assert.rejects(registry.open('door-unknown', 3), { message: 'Door door-unknown is not managed by this agent' });
  });

  it('refuses disabled doors without touching the hardware', async () => {
    const { registry, driverOf } = fakeRegistry();
    await registry.apply([door({ id: 'door-main', name: 'Entrée', isActive: false })]);
    await assert.rejects(registry.open('door-main', 3), { message: 'Door "Entrée" is disabled' });
    assert.deepEqual(driverOf('door-main').opened, []);
  });

  it('uses the requested duration, else the door unlock time, else 5 s', async () => {
    const { registry, driverOf } = fakeRegistry();
    await registry.apply([door({ id: 'a', unlockSeconds: 7 }), door({ id: 'b', unlockSeconds: 0 })]);
    await registry.open('a', 3);
    await registry.open('a');
    await registry.open('a', 0);
    await registry.open('a', -2);
    await registry.open('b');
    assert.deepEqual(driverOf('a').opened, [3, 7, 7, 7]);
    assert.deepEqual(driverOf('b').opened, [5]);
  });

  it('passes driver failures on to the caller', async () => {
    const { registry, driverOf } = fakeRegistry();
    await registry.apply([door({ id: 'relay', driver: 'HTTP_RELAY' })]);
    driverOf('relay').openError = new Error('Relay answered HTTP 401');
    await assert.rejects(registry.open('relay', 3), { message: 'Relay answered HTTP 401' });
  });
});

describe('DoorRegistry.apply', () => {
  it('starts new doors, keeps unchanged ones, restarts reconfigured ones and stops removed ones', async () => {
    const { registry, drivers, driverOf } = fakeRegistry();
    const relay = door({ id: 'relay', driver: 'HTTP_RELAY', config: { url: 'http://10.0.0.9/open' } });
    const sim = door({ id: 'sim' });
    const zk = door({ id: 'zk', driver: 'ZKTECO', config: { ip: '10.0.0.5' } });
    assert.deepEqual(await registry.apply([relay, sim, zk]), { started: ['relay', 'sim', 'zk'], stopped: [] });
    assert.ok(drivers.every((driver) => driver.started === 1));
    const firstZk = driverOf('zk');

    const result = await registry.apply([
      { ...relay, name: 'Vestiaires', unlockSeconds: 9 }, // only metadata changed
      { ...zk, config: { ip: '10.0.0.6' } }, // new address
    ]);
    assert.deepEqual(result, { started: ['zk'], stopped: ['sim', 'zk'] });
    assert.equal(driverOf('sim').stopped, 1);
    assert.equal(firstZk.stopped, 1);
    assert.notEqual(driverOf('zk'), firstZk);
    assert.equal(driverOf('relay').stopped, 0, 'relay kept running');
    assert.equal(registry.get('relay')?.name, 'Vestiaires');
    await registry.open('relay');
    assert.deepEqual(driverOf('relay').opened, [9]);
    assert.deepEqual(
      registry.list().map((entry) => entry.id),
      ['relay', 'zk'],
    );
  });

  it('a door switched to another driver kind gets a new driver', async () => {
    const { registry, driverOf } = fakeRegistry();
    await registry.apply([door({ id: 'main' })]);
    const result = await registry.apply([door({ id: 'main', driver: 'HTTP_RELAY' })]);
    assert.deepEqual(result, { started: ['main'], stopped: ['main'] });
    assert.equal(driverOf('main').kind, 'HTTP_RELAY');
  });

  it('a door whose driver cannot be built is skipped and the others still start', async () => {
    const { registry, entries } = fakeRegistry();
    const result = await registry.apply([door({ id: 'odd', driver: 'BROKEN' as DoorDriverKind }), door({ id: 'sim' })]);
    assert.deepEqual(result, { started: ['sim'], stopped: [] });
    assert.ok(
      entries.some(
        (entry) =>
          entry.level === 'error' && entry.msg === 'could not start door driver' && entry.doorId === 'odd' && entry.error === 'Unknown door driver BROKEN',
      ),
    );
    await assert.rejects(registry.open('odd'), /not managed by this agent/);
  });

  it('applies successive door lists in the order they arrived', async () => {
    const { registry, driverOf } = fakeRegistry();
    const first = registry.apply([door({ id: 'sim' })]);
    const second = registry.apply([]);
    assert.deepEqual(await first, { started: ['sim'], stopped: [] });
    assert.deepEqual(await second, { started: [], stopped: ['sim'] });
    assert.equal(driverOf('sim').stopped, 1);
    assert.deepEqual(registry.list(), []);
  });
});

describe('DoorRegistry status and member sync', () => {
  it('reports each door status; disabled doors always report ok', async () => {
    const { registry, driverOf } = fakeRegistry();
    await registry.apply([door({ id: 'ok' }), door({ id: 'broken' }), door({ id: 'off', isActive: false })]);
    driverOf('broken').state = { status: 'error', error: 'Relay answered HTTP 401' };
    driverOf('off').state = { status: 'error', error: 'unplugged' };
    assert.deepEqual(registry.statuses(), [
      { id: 'ok', status: 'ok' },
      { id: 'broken', status: 'error', error: 'Relay answered HTTP 401' },
      { id: 'off', status: 'ok' },
    ]);
  });

  it('pushes members only to active, reachable terminals that store users, one outcome per terminal', async () => {
    const { registry, driverOf } = fakeRegistry();
    await registry.apply([
      door({ id: 'zk-1', driver: 'ZKTECO' }),
      door({ id: 'zk-2', driver: 'ZKTECO' }),
      door({ id: 'zk-off', driver: 'ZKTECO', isActive: false }),
      door({ id: 'zk-down', driver: 'ZKTECO' }),
      door({ id: 'relay', driver: 'HTTP_RELAY' }),
    ]);
    driverOf('zk-2').syncUsers = async () => {
      throw new Error('terminal full');
    };
    driverOf('zk-down').state = { status: 'error', error: 'unreachable' };

    const outcomes = await registry.syncUsers([{ deviceUid: 1, name: 'Sami Ben Ali', cardNumber: null, active: true }]);
    assert.deepEqual(outcomes, [
      { doorId: 'zk-1', result: synced },
      { doorId: 'zk-2', error: 'terminal full' },
    ]);
  });

  it('knows when a member sync is worth asking the server for', async () => {
    const { registry, driverOf } = fakeRegistry();
    await registry.apply([door({ id: 'relay', driver: 'HTTP_RELAY' }), door({ id: 'sim' })]);
    assert.equal(registry.hasConnectedUserTerminals(), false);
    await registry.apply([door({ id: 'relay', driver: 'HTTP_RELAY' }), door({ id: 'zk', driver: 'ZKTECO' })]);
    assert.equal(registry.hasConnectedUserTerminals(), true);
    driverOf('zk').state = { status: 'error', error: 'unreachable' };
    assert.equal(registry.hasConnectedUserTerminals(), false);
  });

  it('stopAll stops every driver, even after one fails to stop, and forgets the doors', async () => {
    const { registry, drivers, driverOf } = fakeRegistry();
    await registry.apply([door({ id: 'a' }), door({ id: 'b' })]);
    driverOf('a').stopError = new Error('socket already closed');
    await registry.stopAll();
    assert.deepEqual(
      drivers.map((driver) => driver.stopped),
      [1, 1],
    );
    assert.deepEqual(registry.list(), []);
    await assert.rejects(registry.open('b'), /not managed by this agent/);
  });
});

test('createDriver picks the driver from the door kind', () => {
  const ctx = driverContext(captureLogger().logger);
  assert.equal(createDriver(door({ id: 's' }), ctx).kind, 'SIMULATOR');
  assert.equal(createDriver(door({ id: 'r', driver: 'HTTP_RELAY', config: { url: 'http://10.0.0.9/open' } }), ctx).kind, 'HTTP_RELAY');
  assert.equal(createDriver(door({ id: 'z', driver: 'ZKTECO', config: {} }), ctx).kind, 'ZKTECO'); // not started: no connection
  assert.throws(() => createDriver(door({ id: 'x', driver: 'WIEGAND' as DoorDriverKind }), ctx), { message: 'Unknown door driver WIEGAND' });
});

test('the simulator opens without hardware and logs the door name', async () => {
  const { logger, entries } = captureLogger();
  const driver = createDriver(door({ id: 'sim', name: 'Entrée' }), driverContext(logger));
  await driver.open(4);
  assert.deepEqual(driver.status(), { status: 'ok' });
  assert.ok(entries.some((entry) => entry.msg === '(simulation) door "Entrée" unlocked' && entry.seconds === 4));
});
