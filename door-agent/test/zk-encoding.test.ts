import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  buildDeleteUserPayload,
  buildUnlockPayload,
  buildUserPacket72,
  deviceName,
  MAX_CARD_NUMBER,
  MAX_DEVICE_UID,
  parseCardNumber,
  parseUserList72,
  parseUserPacket72,
  USER_LIST_REQUEST,
  ZK_COMMANDS,
  ZK_EVENT,
  ZK_PRIVILEGE,
  ZK_REPLY,
} from '../src/doors/zk-protocol';
import { allocateUid, parseZktecoConfig } from '../src/doors/zkteco';

// zkteco-js ships its own command table and record decoder: the agent's payloads must agree with them.
const { COMMANDS, REQUEST_DATA } = require('zkteco-js/src/helper/command') as {
  COMMANDS: Record<string, number>;
  REQUEST_DATA: Record<string, Buffer>;
};
const { decodeUserData72 } = require('zkteco-js/src/helper/utils') as {
  decodeUserData72(record: Buffer): { uid: number; role: number; name: string; cardno: number; userId: string };
};

/** Independent reading of pyzk's 'HB8s24s4sx7sx24s' user record. */
function readPyzkRecord(packet: Buffer) {
  const text = (start: number, size: number) => packet.toString('latin1', start, start + size).replace(/\0+$/, '');
  return {
    uid: packet.readUInt16LE(0),
    privilege: packet.readUInt8(2),
    password: text(3, 8),
    name: text(11, 24),
    card: packet.readUInt32LE(35),
    padding: [packet[39], packet[47]],
    groupId: text(40, 7),
    userId: text(48, 24),
  };
}

test('command ids match the ZKTeco protocol table of zkteco-js', () => {
  assert.equal(ZK_COMMANDS.UNLOCK, 31);
  assert.equal(ZK_COMMANDS.UNLOCK, COMMANDS.CMD_UNLOCK);
  assert.equal(ZK_COMMANDS.USER_WRQ, COMMANDS.CMD_USER_WRQ);
  assert.equal(ZK_COMMANDS.DELETE_USER, COMMANDS.CMD_DELETE_USER);
  assert.equal(ZK_COMMANDS.REFRESH_DATA, COMMANDS.CMD_REFRESHDATA);
  assert.equal(ZK_COMMANDS.REG_EVENT, COMMANDS.CMD_REG_EVENT);
  assert.equal(ZK_EVENT.ATTLOG, COMMANDS.EF_ATTLOG);
  for (const [name, code] of Object.entries(ZK_REPLY)) assert.equal(code, COMMANDS[`CMD_${name}`], name);
  assert.deepEqual(USER_LIST_REQUEST, REQUEST_DATA.GET_USERS);
});

test('user records are read back field by field, a full 24-character name included', () => {
  const user = {
    uid: 513,
    userId: '987654321',
    name: 'Rania Ben Hedi Ghannouch', // 24 characters: no NUL before the card number
    privilege: ZK_PRIVILEGE.DISABLED,
    password: '12345678',
    card: 3_000_000_123,
    groupId: '1',
  };
  const packet = buildUserPacket72(user);
  assert.deepEqual(parseUserPacket72(packet), user);
  // zkteco-js reads such a name on into the card number: the reason for the agent's own decoder
  assert.notEqual(decodeUserData72(packet).name, user.name);
  assert.deepEqual(parseUserPacket72(buildUserPacket72({ uid: 1, userId: '1', name: '' })), {
    uid: 1,
    userId: '1',
    name: '',
    privilege: 0,
    password: '',
    card: 0,
    groupId: '',
  });
  assert.throws(() => parseUserPacket72(packet.subarray(0, 71)), RangeError);
});

test('user lists: size first, then 72-byte records; anything incomplete is refused', () => {
  const records = [1, 2, 3].map((uid) => buildUserPacket72({ uid, userId: String(uid * 10), name: `User ${uid}` }));
  const size = Buffer.alloc(4);
  size.writeUInt32LE(3 * 72, 0);
  const list = Buffer.concat([size, ...records]);
  assert.deepEqual(
    parseUserList72(list).map((user) => [user.uid, user.userId, user.name]),
    [
      [1, '10', 'User 1'],
      [2, '20', 'User 2'],
      [3, '30', 'User 3'],
    ],
  );
  assert.equal(parseUserList72(Buffer.concat([list, Buffer.alloc(80)])).length, 3, 'bytes after the list are not users');
  assert.deepEqual(parseUserList72(Buffer.alloc(4)), [], 'an empty terminal');
  assert.throws(() => parseUserList72(list.subarray(0, list.length - 1)), /Incomplete user list from the terminal \(215 of 216 bytes\)/);
  assert.throws(() => parseUserList72(Buffer.alloc(0)), /Incomplete user list/);
  const odd = Buffer.alloc(4 + 28);
  odd.writeUInt32LE(28, 0);
  assert.throws(() => parseUserList72(odd), /not 72-byte records/);
});

test('unlock payload is 4 bytes, uint32 little-endian, in tenths of a second', () => {
  // 26 s = 260 = 0x0104: the low byte comes first
  assert.deepEqual([...buildUnlockPayload(26)], [0x04, 0x01, 0x00, 0x00]);
  assert.deepEqual([...buildUnlockPayload(1)], [10, 0, 0, 0]);
});

test('unlock duration is rounded to whole seconds and kept within 1..60 s', () => {
  const tenths = (seconds: number) => buildUnlockPayload(seconds).readUInt32LE(0);
  assert.equal(tenths(2.5), 30);
  assert.equal(tenths(0.4), 10);
  assert.equal(tenths(60), 600);
  assert.equal(tenths(61), 600);
  assert.equal(tenths(1e9), 600);
  assert.throws(() => buildUnlockPayload(Number.POSITIVE_INFINITY), RangeError);
  assert.throws(() => buildUnlockPayload(-0.5), RangeError);
});

test('user packet fields land at the pyzk offsets', () => {
  const packet = buildUserPacket72({
    uid: 513,
    userId: '987654321',
    name: 'Sami Ben Ali',
    privilege: ZK_PRIVILEGE.ADMIN,
    password: '1234',
    card: 0x01020304,
    groupId: '1',
  });
  assert.equal(packet.length, 72);
  assert.deepEqual(readPyzkRecord(packet), {
    uid: 513,
    privilege: 14,
    password: '1234',
    name: 'Sami Ben Ali',
    card: 0x01020304,
    padding: [0, 0],
    groupId: '1',
    userId: '987654321',
  });
  assert.deepEqual([...packet.subarray(35, 39)], [0x04, 0x03, 0x02, 0x01]);
});

test('user packet cuts text fields to their size and drops non-ASCII characters', () => {
  const record = readPyzkRecord(
    buildUserPacket72({ uid: 1, userId: '1', name: 'Ahmed Ben Salah Trabelsi Jr', password: 'pässwörd-long', groupId: '123456789' }),
  );
  assert.equal(record.name, 'Ahmed Ben Salah Trabelsi');
  assert.equal(record.password, 'psswrd-l');
  assert.equal(record.groupId, '1234567');
});

test('zkteco-js reads back the users the agent writes', () => {
  const user = decodeUserData72(
    buildUserPacket72({ uid: 300, userId: '42', name: 'Rania Trabelsi', privilege: ZK_PRIVILEGE.DISABLED, card: 3_000_000_123 }),
  );
  assert.deepEqual(
    { uid: user.uid, role: user.role, name: user.name, cardno: user.cardno, userId: user.userId },
    { uid: 300, role: ZK_PRIVILEGE.DISABLED, name: 'Rania Trabelsi', cardno: 3_000_000_123, userId: '42' },
  );
});

test('user packet validates the slot, the PIN and the card number', () => {
  const user = { uid: 1, userId: '1', name: 'X' };
  assert.equal(buildUserPacket72({ ...user, uid: MAX_DEVICE_UID }).readUInt16LE(0), MAX_DEVICE_UID);
  assert.throws(() => buildUserPacket72({ ...user, uid: MAX_DEVICE_UID + 1 }), RangeError);
  assert.throws(() => buildUserPacket72({ ...user, uid: 1.5 }), RangeError);
  assert.doesNotThrow(() => buildUserPacket72({ ...user, userId: '123456789' }));
  for (const userId of ['', '1234567890', '12a', ' 12', '-1']) {
    assert.throws(() => buildUserPacket72({ ...user, userId }), RangeError, JSON.stringify(userId));
  }
  assert.equal(buildUserPacket72({ ...user, card: MAX_CARD_NUMBER }).readUInt32LE(35), MAX_CARD_NUMBER);
  for (const card of [-1, 1.5, Number.NaN]) assert.throws(() => buildUserPacket72({ ...user, card }), RangeError, String(card));
});

test('delete payload is the slot as uint16 little-endian', () => {
  assert.deepEqual([...buildDeleteUserPayload(1)], [1, 0]);
  assert.deepEqual([...buildDeleteUserPayload(MAX_DEVICE_UID)], [0xff, 0xff]);
  for (const uid of [0, MAX_DEVICE_UID + 1, 2.5]) assert.throws(() => buildDeleteUserPayload(uid), RangeError, String(uid));
});

test('device names: accents folded, other scripts dropped, surrounding spaces trimmed', () => {
  assert.equal(deviceName('Françoise Müller-Núñez'), 'Francoise Muller-Nunez');
  assert.equal(deviceName('محمد Ali'), 'Ali');
  // Arabic-only names have nothing the terminal can display
  assert.equal(deviceName('محمد علي'), '');
  assert.equal(deviceName('Sami Ben Ali', 4), 'Sami');
});

test('badge numbers: digits within 32 bits, anything else means no card', () => {
  assert.equal(parseCardNumber('0000000001'), 1);
  assert.equal(parseCardNumber('\t0012345678\n'), 12_345_678);
  for (const raw of ['-5', '12.5', '12 34', '', 'card-1']) assert.equal(parseCardNumber(raw), 0, raw);
  assert.equal(parseCardNumber(undefined), 0);
});

test('ZKTeco door config: defaults come from the agent settings', () => {
  assert.deepEqual(parseZktecoConfig({ ip: ' 192.168.1.201 ' }, { timeoutMs: 5000, inport: 5200 }), {
    ip: '192.168.1.201',
    port: 4370,
    timeoutMs: 5000,
    inport: 5200,
    punchMethod: 'CARD',
    syncUsers: true,
    realtime: true,
  });
});

test('ZKTeco door config: explicit values', () => {
  const config = parseZktecoConfig(
    { ip: '10.0.0.5', port: '4371', timeoutMs: 3000, inport: 5300, punchMethod: 'fingerprint', syncUsers: false, realtime: false },
    { timeoutMs: 5000, inport: 5200 },
  );
  assert.deepEqual(config, {
    ip: '10.0.0.5',
    port: 4371,
    timeoutMs: 3000,
    inport: 5300,
    punchMethod: 'FINGERPRINT',
    syncUsers: false,
    realtime: false,
  });
});

test('ZKTeco door config: invalid values', () => {
  const defaults = { timeoutMs: 5000, inport: 5200 };
  for (const ip of [undefined, '   ', 42]) assert.throws(() => parseZktecoConfig({ ip }, defaults), /needs config\.ip/);
  for (const port of [0, 65_536, 'abc', 4370.5]) {
    assert.throws(() => parseZktecoConfig({ ip: '10.0.0.5', port }, defaults), /Invalid ZKTeco port/, String(port));
  }
  assert.equal(parseZktecoConfig({ ip: 'x', timeoutMs: 100 }, defaults).timeoutMs, 5000);
  assert.equal(parseZktecoConfig({ ip: 'x', timeoutMs: 'soon' }, defaults).timeoutMs, 5000);
  assert.equal(parseZktecoConfig({ ip: 'x', punchMethod: 'FACE' }, defaults).punchMethod, 'CARD');
});

test('terminal slot allocation', () => {
  assert.equal(allocateUid(0, new Set([1, 2])), 3);
  assert.equal(allocateUid(-4, new Set()), 1);
  assert.equal(allocateUid(MAX_DEVICE_UID, new Set()), MAX_DEVICE_UID);
  const full = new Set(Array.from({ length: MAX_DEVICE_UID }, (_, i) => i + 1));
  assert.equal(allocateUid(7, full), null);
});
