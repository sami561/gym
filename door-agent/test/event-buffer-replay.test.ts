import { test, type TestContext } from 'node:test';
import assert from 'node:assert/strict';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { EventBuffer, type EventBatch } from '../src/events/event-buffer';
import type { DeviceEvent } from '../src/types/contracts';
import { waitFor } from './helpers/net';

const punch = (deviceUserId: string, minute: number, method: DeviceEvent['method'] = 'CARD'): DeviceEvent => ({
  deviceUserId,
  method,
  at: `2026-11-02T08:${String(minute).padStart(2, '0')}:00.000Z`,
});

const users = (batch: EventBatch | null) => batch?.events.map((event) => event.deviceUserId);

function tempDir(t: TestContext): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'door-agent-events-'));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  return dir;
}

function readSaved(file: string): (DeviceEvent & { doorId: string })[] {
  return JSON.parse(fs.readFileSync(file, 'utf8'));
}

test('replays doors in the order of their oldest pending punch, each door in arrival order', () => {
  const buffer = new EventBuffer({ max: 100 });
  buffer.push('door-a', punch('1', 0));
  buffer.push('door-b', punch('2', 1));
  buffer.push('door-a', punch('3', 2));
  buffer.push('door-c', punch('4', 3));
  buffer.push('door-b', punch('5', 4));

  const delivered: [string, string[] | undefined][] = [];
  for (let batch = buffer.nextBatch(); batch; batch = buffer.nextBatch()) {
    delivered.push([batch.doorId, users(batch)]);
    buffer.ack(batch.keys);
  }
  assert.deepEqual(delivered, [
    ['door-a', ['1', '3']],
    ['door-b', ['2', '5']],
    ['door-c', ['4']],
  ]);
  assert.equal(buffer.size, 0);
});

test('a batch the server did not acknowledge is handed out again, unchanged', () => {
  const buffer = new EventBuffer({ max: 100 });
  buffer.push('door-a', punch('1', 0));
  buffer.push('door-a', punch('2', 1));
  const first = buffer.nextBatch();
  // delivery failed: nothing acknowledged
  const retry = buffer.nextBatch();
  assert.deepEqual(retry, first);
  buffer.ack(retry!.keys);
  assert.equal(buffer.nextBatch(), null);
});

test('batches carry only the protocol fields', () => {
  const buffer = new EventBuffer({ max: 100 });
  buffer.push('door-a', { ...punch('7', 0, 'FINGERPRINT'), extra: 'not sent' } as DeviceEvent);
  assert.deepEqual(buffer.nextBatch()!.events, [{ deviceUserId: '7', method: 'FINGERPRINT', at: '2026-11-02T08:00:00.000Z' }]);
});

test('pending punches reach the disk shortly after they arrive, in the documented format', async (t) => {
  const file = path.join(tempDir(t), 'data', 'pending-events.json'); // DATA_DIR does not exist yet
  const buffer = new EventBuffer({ max: 100, file, persistDelayMs: 20 });
  buffer.push('door-a', punch('1', 0));
  buffer.push('door-b', punch('2', 1, 'FINGERPRINT'));
  assert.equal(fs.existsSync(file), false, 'writes are debounced');

  await waitFor(() => fs.existsSync(file), 'the pending events file');
  assert.deepEqual(readSaved(file), [
    { doorId: 'door-a', deviceUserId: '1', method: 'CARD', at: '2026-11-02T08:00:00.000Z' },
    { doorId: 'door-b', deviceUserId: '2', method: 'FINGERPRINT', at: '2026-11-02T08:01:00.000Z' },
  ]);
  assert.deepEqual(fs.readdirSync(path.dirname(file)), ['pending-events.json'], 'no temporary file left behind');
});

test('acknowledged punches disappear from the file', (t) => {
  const file = path.join(tempDir(t), 'pending-events.json');
  const buffer = new EventBuffer({ max: 100, file });
  buffer.push('door-a', punch('1', 0));
  buffer.push('door-a', punch('2', 1));
  buffer.flushToDisk();
  buffer.ack([buffer.nextBatch()!.keys[0]]);
  buffer.flushToDisk();
  assert.deepEqual(readSaved(file).map((event) => event.deviceUserId), ['2']);
});

test('a restarted agent replays the punches the previous run could not deliver', (t) => {
  const file = path.join(tempDir(t), 'pending-events.json');
  const previous = new EventBuffer({ max: 100, file });
  previous.push('door-a', punch('1', 0));
  previous.push('door-b', punch('2', 1));
  previous.ack(previous.nextBatch()!.keys); // door-a was delivered before the restart
  previous.flushToDisk();

  const restarted = new EventBuffer({ max: 100, file });
  assert.equal(restarted.load(), 1);
  const batch = restarted.nextBatch();
  assert.equal(batch?.doorId, 'door-b');
  assert.deepEqual(batch?.events, [punch('2', 1)]);
});

test('files written by earlier versions stay readable', (t) => {
  // Shape written by EventBuffer.flushToDisk since the first release (CLAUDE.md: keep it backward compatible).
  const file = path.join(tempDir(t), 'pending-events.json');
  fs.writeFileSync(
    file,
    '[{"doorId":"door-zk","deviceUserId":"12","method":"CARD","at":"2026-11-01T18:45:10.000Z"},' +
      '{"doorId":"door-zk","deviceUserId":"13","method":"FINGERPRINT","at":"2026-11-01T18:46:00.000Z"}]',
  );
  const buffer = new EventBuffer({ max: 100, file });
  assert.equal(buffer.load(), 2);
  assert.deepEqual(buffer.nextBatch()?.events, [
    { deviceUserId: '12', method: 'CARD', at: '2026-11-01T18:45:10.000Z' },
    { deviceUserId: '13', method: 'FINGERPRINT', at: '2026-11-01T18:46:00.000Z' },
  ]);
});

test('loading skips malformed entries and files that are not a list', (t) => {
  const dir = tempDir(t);
  const file = path.join(dir, 'pending-events.json');
  fs.writeFileSync(
    file,
    JSON.stringify([
      null,
      42,
      'door-a|1|t',
      { doorId: 1, deviceUserId: '1' },
      { doorId: 'door-a', deviceUserId: 7 },
      { doorId: 'door-a', deviceUserId: '8', method: 'CARD', at: '2026-11-02T08:08:00.000Z' },
    ]),
  );
  const buffer = new EventBuffer({ max: 100, file });
  assert.equal(buffer.load(), 1);
  assert.deepEqual(users(buffer.nextBatch()), ['8']);

  fs.writeFileSync(file, JSON.stringify({ events: [] }));
  assert.equal(new EventBuffer({ max: 100, file }).load(), 0);
  assert.equal(new EventBuffer({ max: 100, file: path.join(dir, 'missing.json') }).load(), 0);
  assert.equal(new EventBuffer({ max: 100 }).load(), 0);
});

test('loading the same file twice does not duplicate punches', (t) => {
  const file = path.join(tempDir(t), 'pending-events.json');
  const writer = new EventBuffer({ max: 100, file });
  writer.push('door-a', punch('1', 0));
  writer.push('door-a', punch('2', 1));
  writer.flushToDisk();

  const buffer = new EventBuffer({ max: 100, file });
  assert.equal(buffer.load(), 2);
  assert.equal(buffer.load(), 0);
  assert.equal(buffer.size, 2);
});

test('the size limit also applies to punches restored from disk (newest kept)', (t) => {
  const file = path.join(tempDir(t), 'pending-events.json');
  const writer = new EventBuffer({ max: 100, file });
  for (let minute = 0; minute < 5; minute++) writer.push('door-a', punch(String(minute), minute));
  writer.flushToDisk();

  const buffer = new EventBuffer({ max: 2, file });
  buffer.load();
  assert.equal(buffer.size, 2);
  assert.equal(buffer.dropped, 3);
  assert.deepEqual(users(buffer.nextBatch()), ['3', '4']);
});

test('a failed background write keeps the punches in memory', async (t) => {
  const blocker = path.join(tempDir(t), 'not-a-directory');
  fs.writeFileSync(blocker, '');
  const buffer = new EventBuffer({ max: 100, file: path.join(blocker, 'pending-events.json'), persistDelayMs: 5 });
  buffer.push('door-a', punch('1', 0));
  await new Promise((resolve) => setTimeout(resolve, 50)); // the background write failed without throwing
  assert.equal(buffer.size, 1);
  assert.throws(() => buffer.flushToDisk(), 'an explicit flush (shutdown) reports the problem');
});

test('replays of acknowledged punches are ignored, within a bounded memory', () => {
  const buffer = new EventBuffer({ max: 2000 });
  const event = (id: number): DeviceEvent => ({ deviceUserId: String(id), method: 'CARD', at: '2026-11-02T08:00:00.000Z' });
  for (let id = 0; id < 1001; id++) buffer.push('door-a', event(id));
  buffer.ack(buffer.nextBatch(2000)!.keys);

  assert.equal(buffer.push('door-a', event(1000)), false, 'recently acknowledged');
  assert.equal(buffer.push('door-a', event(0)), true, 'only the last 1000 acknowledgements are remembered');
});
