import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  buildDeleteUserPayload,
  buildRegEventPayload,
  buildUnlockPayload,
  buildUserPacket72,
  decodeAttendanceEvent,
  deviceName,
  parseCardNumber,
  replyName,
  ZK_PRIVILEGE,
  ZkTcpReader,
} from '../src/doors/zk-protocol';
import { allocateUid } from '../src/doors/zkteco';
import { fillPlaceholders, parseHttpRelayConfig } from '../src/doors/http-relay';
import { punchFrame } from './helpers/fake-zk-terminal';

/** TCP packet as the terminal sends it: "PP\x82}", uint32 LE length, header, payload. */
function tcpPacket(command: number, session: number, payload: Buffer = Buffer.alloc(0)): Buffer {
  const body = Buffer.alloc(8 + payload.length);
  body.writeUInt16LE(command, 0);
  body.writeUInt16LE(session, 4);
  body.writeUInt16LE(7, 6);
  payload.copy(body, 8);
  const top = Buffer.from([0x50, 0x50, 0x82, 0x7d, 0, 0, 0, 0]);
  top.writeUInt32LE(body.length, 4);
  return Buffer.concat([top, body]);
}

/** Event payload with the 24-byte PIN layout of the given size. */
function namedEvent(size: number, userId: string, time: number[]): Buffer {
  const payload = Buffer.alloc(size);
  payload.write(userId, 0, 24, 'latin1');
  Buffer.from(time).copy(payload, 26);
  return payload;
}

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

test('event subscription payload and reply names', () => {
  assert.deepEqual([...buildRegEventPayload()], [1, 0, 0, 0]);
  assert.equal(replyName(2000), 'CMD_ACK_OK (2000)');
  assert.equal(replyName(2001), 'CMD_ACK_ERROR (2001)');
  assert.equal(replyName(65_535), 'CMD_ACK_UNKNOWN (65535)');
  assert.equal(replyName(1501), 'reply 1501');
});

test('packet reader: several packets in one read, packets cut anywhere', () => {
  const stream = Buffer.concat([tcpPacket(2000, 42), tcpPacket(500, 1, Buffer.from('abc')), tcpPacket(2001, 42)]);
  const all = new ZkTcpReader().push(stream);
  assert.deepEqual(
    all.map((packet) => [packet.command, packet.session, packet.replyId, packet.payload.toString()]),
    [
      [2000, 42, 7, ''],
      [500, 1, 7, 'abc'],
      [2001, 42, 7, ''],
    ],
  );

  const reader = new ZkTcpReader();
  const byteByByte = [...stream].flatMap((byte) => reader.push(Buffer.from([byte])));
  assert.deepEqual(byteByByte, all);
});

test('packet reader: garbage or an impossible length is skipped up to the next packet', () => {
  const reader = new ZkTcpReader();
  const bogusLength = Buffer.from([0x50, 0x50, 0x82, 0x7d, 3, 0, 0, 0]); // shorter than a header
  const packets = reader.push(Buffer.concat([Buffer.from('noise!!!!'), bogusLength, tcpPacket(2000, 42)]));
  assert.deepEqual(
    packets.map((packet) => packet.command),
    [2000],
  );
  // a packet start cut by the end of a read is kept for the next one
  assert.deepEqual(reader.push(Buffer.from('more noise\x50\x50')), []);
  assert.deepEqual(
    reader.push(tcpPacket(2001, 42).subarray(2)).map((packet) => packet.command),
    [2001],
  );
});

test('attendance events: 24-byte PIN layouts (32 to 52+ bytes), terminal local time', () => {
  const at = new Date(2026, 10, 2, 8, 30, 15);
  const [packet] = new ZkTcpReader().push(punchFrame('42', at));
  assert.deepEqual(decodeAttendanceEvent(packet.payload), { userId: '42', at });
  for (const size of [32, 36, 37, 52, 60]) {
    assert.deepEqual(decodeAttendanceEvent(namedEvent(size, '123456789', [26, 11, 2, 23, 59, 58])), {
      userId: '123456789',
      at: new Date(2026, 10, 2, 23, 59, 58),
    });
  }
  // the PIN field is read up to its first NUL, within its 24 bytes
  assert.equal(decodeAttendanceEvent(namedEvent(52, '7\0garbage', [26, 1, 1, 0, 0, 0]))?.userId, '7');
});

test('attendance events: numeric PIN layouts of older firmware', () => {
  const time = [26, 11, 2, 7, 5, 0];
  const expected = new Date(2026, 10, 2, 7, 5, 0);
  const short = Buffer.from([0x39, 0x30, 0, 1, ...time]); // uint16 PIN 12345, state, verify, time
  assert.deepEqual(decodeAttendanceEvent(short), { userId: '12345', at: expected });
  assert.deepEqual(decodeAttendanceEvent(Buffer.concat([short, Buffer.alloc(4)])), { userId: '12345', at: expected });
  const long = Buffer.from([0x15, 0xcd, 0x5b, 0x07, 0, 1, ...time]); // uint32 PIN 123456789
  assert.deepEqual(decodeAttendanceEvent(long), { userId: '123456789', at: expected });
});

test('attendance events: unknown layouts, empty PINs and impossible dates', () => {
  for (const size of [0, 9, 11, 16, 31]) assert.equal(decodeAttendanceEvent(Buffer.alloc(size)), null, String(size));
  assert.equal(decodeAttendanceEvent(namedEvent(52, '', [26, 1, 1, 0, 0, 0])), null);
  for (const time of [
    [26, 13, 1, 0, 0, 0],
    [26, 2, 30, 0, 0, 0],
    [26, 1, 1, 24, 0, 0],
    [26, 1, 0, 0, 0, 0],
  ]) {
    assert.deepEqual(decodeAttendanceEvent(namedEvent(52, '8', time)), { userId: '8', at: null }, JSON.stringify(time));
  }
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
