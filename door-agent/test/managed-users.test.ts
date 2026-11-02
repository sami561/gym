import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as fs from 'fs';
import * as path from 'path';
import { MANAGED_USERS_VERSION, ManagedUsers } from '../src/doors/managed-users';
import { tempDataDir } from './helpers/fixtures';

test('one versioned file per door in DATA_DIR, PINs sorted, written atomically', (t) => {
  const dataDir = path.join(tempDataDir(t), 'data'); // DATA_DIR does not exist yet
  const file = ManagedUsers.fileFor(dataDir, '8c1d5e2a-0000-4000-8000-000000000001');
  assert.equal(path.basename(file), 'zkteco-users-8c1d5e2a-0000-4000-8000-000000000001.json');
  assert.equal(path.basename(ManagedUsers.fileFor(dataDir, '../door 1')), 'zkteco-users-___door_1.json');

  const users = new ManagedUsers(file, 'door-a');
  assert.equal(users.load(), null, 'no file yet: nothing to report');
  assert.equal(users.persisted, false, 'first sync of the terminal');
  for (const pin of ['12', '7', '100']) users.add(pin);
  users.save();
  assert.deepEqual(JSON.parse(fs.readFileSync(file, 'utf8')), { version: MANAGED_USERS_VERSION, doorId: 'door-a', pins: ['7', '12', '100'] });
  assert.deepEqual(fs.readdirSync(dataDir), [path.basename(file)], 'no temporary file left behind');
  assert.equal(users.persisted, true);
  assert.equal(users.changed, false);
});

test('a restarted agent reads the list back', (t) => {
  const file = ManagedUsers.fileFor(tempDataDir(t), 'door-a');
  const before = new ManagedUsers(file, 'door-a');
  before.add('3');
  before.save();

  const after = new ManagedUsers(file, 'door-a');
  assert.equal(after.load(), null);
  assert.equal(after.persisted, true);
  assert.equal(after.has('3'), true);
  assert.equal(after.has('4'), false);
  assert.equal(after.changed, false);
});

test('changes are tracked; PINs no longer on the terminal are forgotten', () => {
  const users = new ManagedUsers('/unused', 'door-a');
  users.add('1');
  users.add('2');
  users.changed = false;
  users.add('2');
  users.delete('9');
  assert.equal(users.changed, false, 'nothing changed');
  users.retain(new Set(['2', '5']));
  assert.deepEqual(users.list(), ['2']);
  assert.equal(users.changed, true);
});

test('unreadable or unknown files are reported and the list starts empty', (t) => {
  const dataDir = tempDataDir(t);
  const file = ManagedUsers.fileFor(dataDir, 'door-a');
  const cases: [content: string, problem: RegExp][] = [
    ['{"version":1,"pins":', /JSON/],
    ['{"version":2,"doorId":"door-a","pins":["1"]}', /unsupported format \(version 2\)/],
    ['{"version":1,"doorId":"door-a","pins":"1"}', /unsupported format/],
    ['null', /unsupported format \(version undefined\)/],
  ];
  for (const [content, problem] of cases) {
    fs.writeFileSync(file, content);
    const users = new ManagedUsers(file, 'door-a');
    assert.match(users.load() ?? '', problem, content);
    assert.equal(users.persisted, false, content);
    assert.deepEqual(users.list(), [], content);
  }

  fs.writeFileSync(file, JSON.stringify({ version: 1, doorId: 'door-a', pins: ['4', 4, '', null, '5'] }));
  const users = new ManagedUsers(file, 'door-a');
  assert.equal(users.load(), null);
  assert.deepEqual(users.list(), ['4', '5'], 'malformed entries are skipped');
});

test('a disk that refuses the file makes save() throw', (t) => {
  const blocker = path.join(tempDataDir(t), 'not-a-directory');
  fs.writeFileSync(blocker, '');
  const users = new ManagedUsers(path.join(blocker, 'zkteco-users-door-a.json'), 'door-a');
  users.add('1');
  assert.throws(() => users.save());
  assert.equal(users.persisted, false);
  assert.equal(users.changed, true);
});
