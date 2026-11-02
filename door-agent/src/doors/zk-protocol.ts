/**
 * ZKTeco standalone protocol helpers (same packet layouts as pyzk).
 * zkteco-js handles sessions and sends the commands; we build their payloads and read the packets
 * the terminal sends back ourselves (zkteco-js decodes one packet per socket read and reads
 * 24-character names past their field).
 */
export const ZK_COMMANDS = {
  USER_WRQ: 8,
  DELETE_USER: 18,
  UNLOCK: 31,
  REG_EVENT: 500,
  REFRESH_DATA: 1013,
} as const;

/** Answers of the terminal (command field of a reply packet). */
export const ZK_REPLY = {
  ACK_OK: 2000,
  ACK_ERROR: 2001,
  ACK_DATA: 2002,
  ACK_RETRY: 2003,
  ACK_REPEAT: 2004,
  ACK_UNAUTH: 2005,
  ACK_ERROR_DATA: 65_531,
  ACK_ERROR_INIT: 65_532,
  ACK_ERROR_CMD: 65_533,
  ACK_UNKNOWN: 65_535,
} as const;

/** CMD_REG_EVENT flags; the terminal puts the flag in the session field of the events it pushes. */
export const ZK_EVENT = { ATTLOG: 1 } as const;

/** Privilege byte: bit 0 set = user disabled (fingerprints/cards kept on the terminal). */
export const ZK_PRIVILEGE = { DEFAULT: 0, DISABLED: 1, ADMIN: 14 } as const;

export const MAX_UNLOCK_SECONDS = 60;
export const MAX_DEVICE_UID = 65_535;
export const MAX_CARD_NUMBER = 4_294_967_295;

/** "CMD_ACK_ERROR (2001)" for a reply code, "reply 1501" for anything else. */
export function replyName(code: number): string {
  const name = Object.entries(ZK_REPLY).find(([, value]) => value === code)?.[0];
  return name ? `CMD_${name} (${code})` : `reply ${code}`;
}

/** CMD_REG_EVENT payload: the events to receive, uint32 little-endian (pyzk: pack("I", flags)). */
export function buildRegEventPayload(flags: number = ZK_EVENT.ATTLOG): Buffer {
  const payload = Buffer.alloc(4);
  payload.writeUInt32LE(flags, 0);
  return payload;
}

/** One protocol packet: 8-byte header (command, checksum, session, reply id), then the payload. */
export interface ZkPacket {
  command: number;
  session: number;
  replyId: number;
  payload: Buffer;
}

/** Start of every packet on TCP ("PP\x82}"). */
const TCP_MAGIC = Buffer.from([0x50, 0x50, 0x82, 0x7d]);
/** A longer packet means the stream is corrupt (a full user list stays far below). */
const MAX_TCP_PACKET = 16 * 1024 * 1024;

/**
 * Splits the TCP stream of a terminal into packets ("PP\x82}", uint32 LE length, then the packet).
 * Several packets can come in one socket read (a burst of badges) and a packet can be cut in two.
 */
export class ZkTcpReader {
  private pending: Buffer = Buffer.alloc(0);

  push(chunk: Buffer): ZkPacket[] {
    this.pending = this.pending.length ? Buffer.concat([this.pending, chunk]) : chunk;
    const packets: ZkPacket[] = [];
    while (this.pending.length >= 8) {
      if (!this.pending.subarray(0, 4).equals(TCP_MAGIC)) {
        // Out of step (garbage on the line): resume at the next packet start, keep a possibly cut one.
        const next = this.pending.indexOf(TCP_MAGIC, 1);
        this.pending = this.pending.subarray(next === -1 ? this.pending.length - 3 : next);
        continue;
      }
      const length = this.pending.readUInt32LE(4);
      if (length < 8 || length > MAX_TCP_PACKET) {
        this.pending = this.pending.subarray(1);
        continue;
      }
      if (this.pending.length < 8 + length) break;
      const body = this.pending.subarray(8, 8 + length);
      this.pending = this.pending.subarray(8 + length);
      packets.push({
        command: body.readUInt16LE(0),
        session: body.readUInt16LE(4),
        replyId: body.readUInt16LE(6),
        payload: body.subarray(8),
      });
    }
    return packets;
  }
}

export interface ZkAttendance {
  /** User PIN. */
  userId: string;
  /** Terminal local time; null when the terminal sent an impossible date. */
  at: Date | null;
}

/**
 * Live attendance event (CMD_REG_EVENT / EF_ATTLOG) in the layouts pyzk reads: 24-byte PIN (32 to
 * 52+ bytes) or a numeric PIN on older firmware (10, 12 or 14 bytes). Unknown layouts give null.
 */
export function decodeAttendanceEvent(payload: Buffer): ZkAttendance | null {
  let userId: string;
  let time: Buffer;
  if (payload.length >= 32) {
    // PIN 24s, verify mode, state, time 6s, then work code / reserved bytes
    userId = textField(payload, 0, 24);
    time = payload.subarray(26, 32);
  } else if (payload.length === 10 || payload.length === 14) {
    userId = String(payload.readUInt16LE(0));
    time = payload.subarray(4, 10);
  } else if (payload.length === 12) {
    userId = String(payload.readUInt32LE(0));
    time = payload.subarray(6, 12);
  } else {
    return null;
  }
  userId = userId.trim();
  return userId ? { userId, at: localTime(time) } : null;
}

/** yy mm dd hh mm ss, terminal local time. */
function localTime(time: Buffer): Date | null {
  const [year, month, day, hour, minute, second] = time;
  if (month < 1 || month > 12 || day < 1 || day > 31 || hour > 23 || minute > 59 || second > 59) return null;
  const at = new Date(2000 + year, month - 1, day, hour, minute, second);
  return at.getDate() === day ? at : null; // 31 April and the like
}

/** CMD_UNLOCK payload: uint32 little-endian, unit = 100 ms (pyzk: pack("I", seconds * 10)). */
export function buildUnlockPayload(seconds: number): Buffer {
  if (!Number.isFinite(seconds) || seconds <= 0) {
    throw new RangeError(`Unlock duration must be a positive number of seconds (got ${seconds})`);
  }
  const clamped = Math.min(Math.max(Math.round(seconds), 1), MAX_UNLOCK_SECONDS);
  const payload = Buffer.alloc(4);
  payload.writeUInt32LE(clamped * 10, 0);
  return payload;
}

export interface ZkUserRecord {
  /** Internal slot on the terminal (1..65535). */
  uid: number;
  /** User PIN shown by the terminal and reported in punches (max 9 chars). */
  userId: string;
  name: string;
  privilege?: number;
  password?: string;
  card?: number;
  groupId?: string;
}

/**
 * CMD_USER_WRQ payload for 72-byte user records (pyzk 'HB8s24s4sx7sx24s').
 * Built here because zkteco-js writes the card number as 16 bits, which truncates RFID badges.
 */
export function buildUserPacket72(user: ZkUserRecord): Buffer {
  if (!Number.isInteger(user.uid) || user.uid < 1 || user.uid > MAX_DEVICE_UID) {
    throw new RangeError(`uid must be between 1 and ${MAX_DEVICE_UID} (got ${user.uid})`);
  }
  if (!/^\d{1,9}$/.test(user.userId)) throw new RangeError(`userId must be 1-9 digits (got "${user.userId}")`);
  const card = user.card ?? 0;
  if (!Number.isInteger(card) || card < 0 || card > MAX_CARD_NUMBER) {
    throw new RangeError(`card must be a 32-bit unsigned integer (got ${card})`);
  }

  const packet = Buffer.alloc(72);
  packet.writeUInt16LE(user.uid, 0);
  packet.writeUInt8((user.privilege ?? ZK_PRIVILEGE.DEFAULT) & 0xff, 2);
  packet.write(asciiField(user.password ?? '', 8), 3, 8, 'latin1');
  packet.write(asciiField(user.name, 24), 11, 24, 'latin1');
  packet.writeUInt32LE(card, 35);
  // byte 39: padding
  packet.write(asciiField(user.groupId ?? '', 7), 40, 7, 'latin1');
  // byte 47: padding
  packet.write(asciiField(user.userId, 24), 48, 24, 'latin1');
  return packet;
}

/** CMD_DATA_WRRQ payload asking for the user table (pyzk: pack('<bhii', 1, CMD_USERTEMP_RRQ, FCT_USER, 0)). */
export const USER_LIST_REQUEST = Buffer.from([0x01, 0x09, 0x00, 0x05, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00]);

/**
 * Reads a 72-byte user record, each text field within its own bounds: zkteco-js reads a name
 * that fills its 24 bytes on into the card number.
 */
export function parseUserPacket72(record: Buffer): Required<ZkUserRecord> {
  if (record.length < 72) throw new RangeError(`user record must be 72 bytes (got ${record.length})`);
  return {
    uid: record.readUInt16LE(0),
    userId: textField(record, 48, 24),
    name: textField(record, 11, 24),
    privilege: record.readUInt8(2),
    password: textField(record, 3, 8),
    card: record.readUInt32LE(35),
    groupId: textField(record, 40, 7),
  };
}

/**
 * Users of a CMD_DATA_WRRQ answer: uint32 LE byte count, then 72-byte records. Throws when the
 * download stopped early: the agent must never take a partial list for the terminal content.
 */
export function parseUserList72(data: Buffer): Required<ZkUserRecord>[] {
  if (data.length < 4) throw new Error('Incomplete user list from the terminal (no size)');
  const size = data.readUInt32LE(0);
  if (data.length - 4 < size) throw new Error(`Incomplete user list from the terminal (${data.length - 4} of ${size} bytes)`);
  if (size % 72 !== 0) throw new Error(`Unsupported user records on the terminal (${size} bytes, not 72-byte records)`);
  const users: Required<ZkUserRecord>[] = [];
  for (let offset = 4; offset < 4 + size; offset += 72) users.push(parseUserPacket72(data.subarray(offset, offset + 72)));
  return users;
}

/** CMD_DELETE_USER payload (pyzk: pack('h', uid)). */
export function buildDeleteUserPayload(uid: number): Buffer {
  if (!Number.isInteger(uid) || uid < 1 || uid > MAX_DEVICE_UID) {
    throw new RangeError(`uid must be between 1 and ${MAX_DEVICE_UID} (got ${uid})`);
  }
  const payload = Buffer.alloc(2);
  payload.writeUInt16LE(uid, 0);
  return payload;
}

/** Terminal displays are ASCII only: strip accents, drop other characters, cut to the field size. */
export function deviceName(name: string, max = 24): string {
  return asciiField(name.normalize('NFD').replace(/[̀-ͯ]/g, ''), max).trim();
}

/** Badge number as the terminal stores it (0 = no card). Non-numeric or too large values are ignored. */
export function parseCardNumber(card: string | null | undefined): number {
  const digits = (card ?? '').trim();
  if (!/^\d{1,10}$/.test(digits)) return 0;
  const value = Number(digits);
  return value <= MAX_CARD_NUMBER ? value : 0;
}

function asciiField(value: string, max: number): string {
  return value.replace(/[^\x20-\x7e]/g, '').slice(0, max);
}

/** Text of a fixed-size field: up to the first NUL, never past the field. */
function textField(buffer: Buffer, start: number, size: number): string {
  const field = buffer.subarray(start, start + size);
  const end = field.indexOf(0);
  return field.toString('latin1', 0, end === -1 ? field.length : end);
}
