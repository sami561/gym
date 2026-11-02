import * as net from 'net';
import { close, listen } from './net';

/** Command ids of the ZKTeco TCP protocol (pyzk / zkteco-js values). */
export const ZK = {
  USER_WRQ: 8,
  DELETE_USER: 18,
  UNLOCK: 31,
  GET_TIME: 201,
  REG_EVENT: 500,
  CONNECT: 1000,
  EXIT: 1001,
  REFRESH_DATA: 1013,
  DATA: 1501,
  FREE_DATA: 1502,
  DATA_WRRQ: 1503,
  ACK_OK: 2000,
  ACK_ERROR: 2001,
  EF_ATTLOG: 1,
} as const;

export interface TerminalUser {
  uid: number;
  role: number;
  password: string;
  name: string;
  card: number;
  userId: string;
}

/** 72-byte user record as stored by the terminal (pyzk 'HB8s24s4sx7sx24s'). */
export function encodeUser(user: TerminalUser): Buffer {
  const record = Buffer.alloc(72);
  record.writeUInt16LE(user.uid, 0);
  record.writeUInt8(user.role, 2);
  record.write(user.password, 3, 8, 'latin1');
  record.write(user.name, 11, 24, 'latin1');
  record.writeUInt32LE(user.card, 35);
  record.write(user.userId, 48, 24, 'latin1');
  return record;
}

/** Reads each field within its own bounds (unlike zkteco-js, which reads the name up to the first NUL). */
export function decodeUser(record: Buffer): TerminalUser {
  const text = (start: number, end: number) => record.subarray(start, end).toString('latin1').split('\0')[0];
  return {
    uid: record.readUInt16LE(0),
    role: record.readUInt8(2),
    password: text(3, 11),
    name: text(11, 35),
    card: record.readUInt32LE(35),
    userId: text(48, 72),
  };
}

function frame(command: number, session: number, replyId: number, payload: Buffer = Buffer.alloc(0)): Buffer {
  const body = Buffer.alloc(8 + payload.length);
  body.writeUInt16LE(command, 0);
  body.writeUInt16LE(session, 4);
  body.writeUInt16LE(replyId, 6);
  payload.copy(body, 8);
  const top = Buffer.from([0x50, 0x50, 0x82, 0x7d, 0, 0, 0, 0]);
  top.writeUInt32LE(body.length, 4);
  return Buffer.concat([top, body]);
}

function punchFrame(userId: string, at: Date): Buffer {
  const payload = Buffer.alloc(52);
  payload.write(userId, 0, 24, 'latin1');
  payload.writeUInt8(1, 24); // verify mode
  Buffer.from([
    at.getFullYear() - 2000,
    at.getMonth() + 1,
    at.getDate(),
    at.getHours(),
    at.getMinutes(),
    at.getSeconds(),
  ]).copy(payload, 26);
  return frame(ZK.REG_EVENT, ZK.EF_ATTLOG, 0, payload);
}

/**
 * Just enough of a ZKTeco terminal on 127.0.0.1 for the driver: handshake, user list, user
 * writes / deletes, unlock, live punches. Users are kept per slot (uid) as raw records.
 */
export class FakeZkTerminal {
  /** Every command received, in order. */
  readonly received: { command: number; payload: Buffer }[] = [];
  /** Reply code per command id (default ACK_OK); null = never answer. */
  readonly replies = new Map<number, number | null>();
  readonly slots = new Map<number, Buffer>();
  connections = 0;
  private readonly sockets = new Set<net.Socket>();
  private readonly session = 0x2a;

  private constructor(
    private readonly server: net.Server,
    readonly port: number,
  ) {}

  static async start(users: TerminalUser[] = []): Promise<FakeZkTerminal> {
    let terminal: FakeZkTerminal | null = null;
    const server = net.createServer((socket) => terminal!.accept(socket));
    terminal = new FakeZkTerminal(server, await listen(server));
    for (const user of users) terminal.slots.set(user.uid, encodeUser(user));
    return terminal;
  }

  users(): TerminalUser[] {
    return [...this.slots.values()].map(decodeUser).sort((a, b) => a.uid - b.uid);
  }

  user(userId: string): TerminalUser | undefined {
    return this.users().find((user) => user.userId === userId);
  }

  payloads(command: number): Buffer[] {
    return this.received.filter((entry) => entry.command === command).map((entry) => entry.payload);
  }

  /** Pushes a live attendance event (time fields in local time, like the terminal clock). */
  sendPunch(userId: string, at: Date): void {
    this.sendPunches([{ userId, at }]);
  }

  /** Several attendance events in a single TCP write (a burst of badges). */
  sendPunches(punches: { userId: string; at: Date }[]): void {
    const frames = Buffer.concat(punches.map(({ userId, at }) => punchFrame(userId, at)));
    for (const socket of this.sockets) socket.write(frames);
  }

  async close(): Promise<void> {
    for (const socket of this.sockets) socket.destroy();
    await close(this.server);
  }

  private accept(socket: net.Socket): void {
    this.connections++;
    this.sockets.add(socket);
    socket.on('close', () => this.sockets.delete(socket));
    socket.on('error', () => undefined);
    let pending = Buffer.alloc(0);
    socket.on('data', (chunk) => {
      pending = Buffer.concat([pending, chunk]);
      while (pending.length >= 8) {
        const length = pending.readUInt32LE(4);
        if (pending.length < 8 + length) break;
        const packet = pending.subarray(8, 8 + length);
        pending = pending.subarray(8 + length);
        this.handle(socket, packet.readUInt16LE(0), packet.readUInt16LE(6), Buffer.from(packet.subarray(8)));
      }
    });
  }

  private handle(socket: net.Socket, command: number, replyId: number, payload: Buffer): void {
    this.received.push({ command, payload });
    const code = this.replies.has(command) ? this.replies.get(command)! : ZK.ACK_OK;
    if (code === null) return;
    const reply = (data?: Buffer) => socket.write(frame(code, this.session, replyId, data));
    if (code !== ZK.ACK_OK) return void reply();

    switch (command) {
      case ZK.DATA_WRRQ: {
        const records = [...this.slots.entries()].sort(([a], [b]) => a - b).map(([, record]) => record);
        const size = Buffer.alloc(4);
        size.writeUInt32LE(records.length * 72, 0);
        socket.write(frame(ZK.DATA, this.session, replyId, Buffer.concat([size, ...records])));
        return;
      }
      case ZK.USER_WRQ:
        this.slots.set(payload.readUInt16LE(0), Buffer.from(payload));
        return void reply();
      case ZK.DELETE_USER:
        this.slots.delete(payload.readUInt16LE(0));
        return void reply();
      case ZK.GET_TIME:
        return void reply(Buffer.alloc(4));
      case ZK.EXIT:
        reply();
        socket.end();
        return;
      default:
        reply();
    }
  }
}
