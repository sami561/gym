import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { EventBuffer } from '../src/events/event-buffer';

const punch = (deviceUserId: string, at: string) => ({ deviceUserId, method: 'CARD' as const, at });

test('ignores duplicate punches, including ones already acknowledged', () => {
  const buffer = new EventBuffer({ max: 100 });
  assert.equal(buffer.push('door-a', punch('12', '2026-11-02T08:00:00.000Z')), true);
  assert.equal(buffer.push('door-a', punch('12', '2026-11-02T08:00:00.000Z')), false);
  const batch = buffer.nextBatch()!;
  buffer.ack(batch.keys);
  assert.equal(buffer.size, 0);
  assert.equal(buffer.push('door-a', punch('12', '2026-11-02T08:00:00.000Z')), false);
});

test('batches per door, oldest door first, and acks remove only the sent events', () => {
  const buffer = new EventBuffer({ max: 100 });
  buffer.push('door-a', punch('1', '2026-11-02T08:00:00.000Z'));
  buffer.push('door-b', punch('2', '2026-11-02T08:00:01.000Z'));
  buffer.push('door-a', punch('3', '2026-11-02T08:00:02.000Z'));

  const first = buffer.nextBatch()!;
  assert.equal(first.doorId, 'door-a');
  assert.deepEqual(first.events.map((e) => e.deviceUserId), ['1', '3']);
  buffer.push('door-a', punch('4', '2026-11-02T08:00:03.000Z'));
  buffer.ack(first.keys);

  const second = buffer.nextBatch()!;
  assert.equal(second.doorId, 'door-b');
  buffer.ack(second.keys);
  assert.deepEqual(buffer.nextBatch()!.events.map((e) => e.deviceUserId), ['4']);
});

test('batch size is capped', () => {
  const buffer = new EventBuffer({ max: 1000 });
  for (let i = 0; i < 250; i++) buffer.push('door-a', punch(String(i), `2026-11-02T08:00:00.${String(i).padStart(3, '0')}Z`));
  assert.equal(buffer.nextBatch(100)!.events.length, 100);
});

test('drops the oldest events beyond the maximum size', () => {
  const buffer = new EventBuffer({ max: 2 });
  buffer.push('door-a', punch('1', 't1'));
  buffer.push('door-a', punch('2', 't2'));
  buffer.push('door-a', punch('3', 't3'));
  assert.equal(buffer.size, 2);
  assert.equal(buffer.dropped, 1);
  assert.deepEqual(buffer.nextBatch()!.events.map((e) => e.deviceUserId), ['2', '3']);
});

test('persists pending events across restarts and survives a corrupt file', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'door-agent-'));
  const file = path.join(dir, 'pending-events.json');
  const first = new EventBuffer({ max: 100, file });
  first.push('door-a', punch('1', 't1'));
  first.push('door-a', punch('2', 't2'));
  first.flushToDisk();

  const second = new EventBuffer({ max: 100, file });
  assert.equal(second.load(), 2);
  assert.equal(second.size, 2);

  fs.writeFileSync(file, '{not json');
  assert.equal(new EventBuffer({ max: 100, file }).load(), 0);
  fs.rmSync(dir, { recursive: true, force: true });
});
