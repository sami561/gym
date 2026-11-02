/**
 * ZKTeco standalone protocol helpers (same packet layouts as pyzk).
 * zkteco-js handles framing/sessions; we only build command payloads here.
 */
export const ZK_COMMANDS = {
  USER_WRQ: 8,
  DELETE_USER: 18,
  UNLOCK: 31,
  REFRESH_DATA: 1013,
} as const;

/** Privilege byte: bit 0 set = user disabled (fingerprints/cards kept on the terminal). */
export const ZK_PRIVILEGE = { DEFAULT: 0, DISABLED: 1, ADMIN: 14 } as const;

export const MAX_UNLOCK_SECONDS = 60;
export const MAX_DEVICE_UID = 65_535;
export const MAX_CARD_NUMBER = 4_294_967_295;

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
