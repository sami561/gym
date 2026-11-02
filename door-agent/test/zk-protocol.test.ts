import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  buildDeleteUserPayload,
  buildUnlockPayload,
  buildUserPacket72,
  deviceName,
  parseCardNumber,
  ZK_PRIVILEGE,
} from '../src/doors/zk-protocol';
import { allocateUid } from '../src/doors/zkteco';
import { fillPlaceholders, parseHttpRelayConfig } from '../src/doors/http-relay';

test('unlock payload is uint32 LE in tenths of a second (pyzk compatible)', () => {
  assert.deepEqual([...buildUnlockPayload(5)], [50, 0, 0, 0]);
  assert.deepEqual([...buildUnlockPayload(3)], [30, 0, 0, 0]);
  assert.equal(buildUnlockPayload(30).readUInt32LE(0), 300);
});

test('unlock payload rounds, clamps to 1..60 s and rejects invalid durations', () => {
  assert.equal(buildUnlockPayload(2.4).readUInt32LE(0), 20);
  assert.equal(buildUnlockPayload(0.2).readUInt32LE(0), 10);
  assert.equal(buildUnlockPayload(600).readUInt32LE(0), 600);
  assert.throws(() => buildUnlockPayload(0), RangeError);
  assert.throws(() => buildUnlockPayload(-1), RangeError);
  assert.throws(() => buildUnlockPayload(Number.NaN), RangeError);
});

test('user packet follows the 72-byte layout with a 32-bit card number', () => {
  const packet = buildUserPacket72({ uid: 7, userId: '1234', name: 'Sami Ben Ali', privilege: 0, card: 3_000_000_123 });
  assert.equal(packet.length, 72);
  assert.equal(packet.readUInt16LE(0), 7);
  assert.equal(packet.readUInt8(2), 0);
  assert.equal(packet.subarray(11, 35).toString('latin1').replace(/\0+$/, ''), 'Sami Ben Ali');
  assert.equal(packet.readUInt32LE(35), 3_000_000_123);
  assert.equal(packet.subarray(48, 72).toString('latin1').replace(/\0+$/, ''), '1234');
});

test('user packet keeps the disabled bit and validates its inputs', () => {
  const packet = buildUserPacket72({ uid: 1, userId: '1', name: 'X', privilege: ZK_PRIVILEGE.DISABLED });
  assert.equal(packet.readUInt8(2), 1);
  assert.throws(() => buildUserPacket72({ uid: 0, userId: '1', name: 'X' }), RangeError);
  assert.throws(() => buildUserPacket72({ uid: 1, userId: 'abc', name: 'X' }), RangeError);
  assert.throws(() => buildUserPacket72({ uid: 1, userId: '1', name: 'X', card: 2 ** 32 }), RangeError);
  assert.deepEqual([...buildDeleteUserPayload(258)], [2, 1]);
});

test('device names are ASCII and at most 24 characters', () => {
  assert.equal(deviceName('Rania Ben Hédi Ghannouchi-Trabelsi'), 'Rania Ben Hedi Ghannouch');
  assert.equal(deviceName('Ahmed  🙂'), 'Ahmed');
});

test('card numbers: digits only, 32-bit, otherwise 0', () => {
  assert.equal(parseCardNumber('0012345678'), 12345678);
  assert.equal(parseCardNumber(' 4294967295 '), 4294967295);
  assert.equal(parseCardNumber('4294967296'), 0);
  assert.equal(parseCardNumber('AB12'), 0);
  assert.equal(parseCardNumber(null), 0);
});

test('terminal slots: member deviceUid when free, else first free slot', () => {
  assert.equal(allocateUid(5, new Set([1, 2])), 5);
  assert.equal(allocateUid(2, new Set([1, 2, 3])), 4);
  assert.equal(allocateUid(70_000, new Set([1])), 2);
});

test('HTTP relay config and placeholders', () => {
  const relay = parseHttpRelayConfig({
    url: 'http://192.168.1.50/rpc/Switch.Set?id=0&on=true&toggle_after={seconds}',
    basicAuth: { username: 'admin', password: 'secret' },
  });
  assert.equal(relay.method, 'GET');
  assert.equal(relay.headers.Authorization, `Basic ${Buffer.from('admin:secret').toString('base64')}`);
  assert.equal(fillPlaceholders(relay.url, { seconds: 5, doorId: 'd1' }), 'http://192.168.1.50/rpc/Switch.Set?id=0&on=true&toggle_after=5');
  const esp = parseHttpRelayConfig({ url: 'http://10.0.0.9/open', method: 'post', body: { seconds: '{seconds}', ms: '{ms}' } });
  assert.equal(esp.headers['Content-Type'], 'application/json');
  assert.equal(fillPlaceholders(esp.body!, { seconds: 4, doorId: 'd1' }), '{"seconds":"4","ms":"4000"}');
  assert.throws(() => parseHttpRelayConfig({ url: 'ftp://x' }));
});
