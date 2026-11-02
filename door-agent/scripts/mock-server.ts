/**
 * Throwaway stand-in for the access-service, to try the agent without the backend:
 *   MOCK_AGENT_KEY=dev-agent-key-0123456789 npm run mock-server
 *   SERVER_URL=http://127.0.0.1:4999 AGENT_KEY=dev-agent-key-0123456789 npm run dev
 * It pushes four doors (simulator, HTTP relay and fake ZKTeco terminal served by this script,
 * plus an unreachable terminal), sends door.open commands, answers members.sync / qr.scanned /
 * device.events, and prints a pass/fail summary after MOCK_DURATION_MS (or on Ctrl+C).
 */
import * as http from 'http';
import * as net from 'net';
import { Server } from 'socket.io';

const PORT = Number(process.env.MOCK_PORT ?? 4999);
const RELAY_PORT = Number(process.env.MOCK_RELAY_PORT ?? 4998);
const ZK_PORT = Number(process.env.MOCK_ZK_PORT ?? 4370);
const KEY = process.env.MOCK_AGENT_KEY ?? 'dev-agent-key-0123456789';
// 0 = run until Ctrl+C (the summary is printed on exit)
const DURATION = Number(process.env.MOCK_DURATION_MS ?? 0);

const checks: Record<string, boolean> = {
  'agent authenticated': false,
  'heartbeat received': false,
  'members.sync answered': false,
  'simulator door opened': false,
  'relay door opened': false,
  'relay endpoint hit': false,
  'unreachable ZKTeco reported as failure': false,
  'unknown door refused': false,
  'qr.scanned answered and door opened': false,
  'buffered punches delivered': false,
  'fake terminal: connect handshake': false,
  'fake terminal: member enrolled with 32-bit badge': false,
  'fake terminal: expired member disabled, fingerprints kept': false,
  'fake terminal: staff user left untouched': false,
  'fake terminal: unlock payload = 50 (5 s)': false,
  'fake terminal: live punch forwarded': false,
};
const log = (msg: string, extra?: unknown) =>
  console.log(`[mock] ${msg}${extra === undefined ? '' : ' ' + JSON.stringify(extra)}`);

const relay = http.createServer((req, res) => {
  log('relay hit', { method: req.method, url: req.url });
  if (req.url?.startsWith('/rpc/Switch.Set')) checks['relay endpoint hit'] = true;
  res.writeHead(200, { 'Content-Type': 'application/json' });
  res.end('{"was_on":false}');
});
relay.listen(RELAY_PORT, '127.0.0.1');


// ---- Fake ZKTeco terminal (TCP, port 4370): just enough of the protocol used by zkteco-js ----
const ZK = { CONNECT: 1000, EXIT: 1001, ACK_OK: 2000, DATA: 1501, FREE_DATA: 1502, DATA_WRRQ: 1503, REG_EVENT: 500, GET_TIME: 201, UNLOCK: 31, USER_WRQ: 8, DELETE_USER: 18, REFRESH: 1013 };
interface FakeUser { uid: number; role: number; password: string; name: string; cardno: number; userId: string }
const deviceUsers = new Map<string, FakeUser>([
  ['900', { uid: 1, role: 14, password: '', name: 'Admin', cardno: 0, userId: '900' }],
  ['2', { uid: 2, role: 0, password: '', name: 'Rania Trabelsi', cardno: 0, userId: '2' }],
]);
let registered = false;
let refreshed = false;
let punchSent = false;

function zkFrame(command: number, session: number, replyId: number, payload: Buffer = Buffer.alloc(0)): Buffer {
  const header = Buffer.alloc(8);
  header.writeUInt16LE(command, 0);
  header.writeUInt16LE(session, 4);
  header.writeUInt16LE(replyId, 6);
  const body = Buffer.concat([header, payload]);
  const top = Buffer.from([0x50, 0x50, 0x82, 0x7d, 0, 0, 0, 0]);
  top.writeUInt32LE(body.length, 4);
  return Buffer.concat([top, body]);
}

const ascii = (buf: Buffer) => buf.toString('latin1').split('\0')[0];

function userRecord(user: FakeUser): Buffer {
  const record = Buffer.alloc(72);
  record.writeUInt16LE(user.uid, 0);
  record.writeUInt8(user.role, 2);
  record.write(user.password, 3, 8, 'latin1');
  record.write(user.name, 11, 24, 'latin1');
  record.writeUInt32LE(user.cardno, 35);
  record.write(user.userId, 48, 9, 'latin1');
  return record;
}

function sendPunch(socket: net.Socket, userId: string) {
  const now = new Date();
  const payload = Buffer.alloc(52);
  payload.write(userId, 0, 24, 'latin1');
  payload.writeUInt8(4, 24); // verify mode
  payload.writeUInt8(0, 25); // check-in
  Buffer.from([now.getFullYear() - 2000, now.getMonth() + 1, now.getDate(), now.getHours(), now.getMinutes(), now.getSeconds()]).copy(payload, 26);
  socket.write(zkFrame(ZK.REG_EVENT, 1 /* EF_ATTLOG */, 0, payload));
  log('fake terminal: punch sent', { userId });
}

const terminal = net.createServer((socket) => {
  let pending = Buffer.alloc(0);
  const session = 0x2a;
  socket.on('error', () => undefined);
  socket.on('data', (chunk) => {
    pending = Buffer.concat([pending, chunk]);
    while (pending.length >= 8) {
      const length = pending.readUInt32LE(4);
      if (pending.length < 8 + length) break;
      const packet = pending.subarray(8, 8 + length);
      pending = pending.subarray(8 + length);
      const command = packet.readUInt16LE(0);
      const replyId = packet.readUInt16LE(6);
      const payload = packet.subarray(8);
      const ack = (data?: Buffer) => socket.write(zkFrame(ZK.ACK_OK, session, replyId, data));

      switch (command) {
        case ZK.CONNECT:
          checks['fake terminal: connect handshake'] = true;
          ack();
          break;
        case ZK.REG_EVENT:
          registered = true;
          ack();
          break;
        case ZK.DATA_WRRQ: {
          const records = [...deviceUsers.values()].map(userRecord);
          const size = Buffer.alloc(4);
          size.writeUInt32LE(records.length * 72, 0);
          socket.write(zkFrame(ZK.DATA, session, replyId, Buffer.concat([size, ...records])));
          break;
        }
        case ZK.USER_WRQ: {
          const user: FakeUser = {
            uid: payload.readUInt16LE(0),
            role: payload.readUInt8(2),
            password: ascii(payload.subarray(3, 11)),
            name: ascii(payload.subarray(11, 35)),
            cardno: payload.readUInt32LE(35),
            userId: ascii(payload.subarray(48, 72)),
          };
          deviceUsers.set(user.userId, user);
          log('fake terminal: user written', user);
          ack();
          break;
        }
        case ZK.DELETE_USER: {
          const uid = payload.readUInt16LE(0);
          for (const [key, user] of deviceUsers) if (user.uid === uid) deviceUsers.delete(key);
          ack();
          break;
        }
        case ZK.REFRESH: {
          refreshed = true;
          const member = deviceUsers.get('1');
          checks['fake terminal: member enrolled with 32-bit badge'] = member?.cardno === 3_000_000_123 && member.name === 'Sami Ben Ali' && member.uid === 3;
          checks['fake terminal: expired member disabled, fingerprints kept'] = (deviceUsers.get('2')?.role ?? 0) % 2 === 1;
          const admin = deviceUsers.get('900');
          checks['fake terminal: staff user left untouched'] = admin?.uid === 1 && admin.role === 14 && admin.name === 'Admin';
          ack();
          if (registered && !punchSent) {
            punchSent = true;
            setTimeout(() => sendPunch(socket, '1'), 1500);
          }
          break;
        }
        case ZK.UNLOCK:
          log('fake terminal: unlock', { payload: payload.readUInt32LE(0) });
          if (payload.readUInt32LE(0) === 50) checks['fake terminal: unlock payload = 50 (5 s)'] = true;
          ack();
          break;
        case ZK.GET_TIME: {
          const time = Buffer.alloc(4);
          time.writeUInt32LE(0, 0);
          ack(time);
          break;
        }
        case ZK.EXIT:
          ack();
          socket.end();
          break;
        default:
          ack();
      }
    }
  });
});
terminal.listen(ZK_PORT, '127.0.0.1', () => log(`fake ZKTeco terminal on 127.0.0.1:${ZK_PORT}`));

const httpServer = http.createServer();
const io = new Server(httpServer, { path: '/agent-socket' });
const agents = io.of('/agents');

agents.use((socket, next) => {
  if (socket.handshake.auth?.key !== KEY) return next(new Error('Invalid agent key'));
  next();
});

agents.on('connection', (socket) => {
  checks['agent authenticated'] = true;
  log('agent connected', { id: socket.id });

  socket.emit('doors', [
    { id: 'door-sim', name: 'Entrée (simulation)', driver: 'SIMULATOR', config: {}, unlockSeconds: 5, isActive: true },
    {
      id: 'door-relay',
      name: 'Porte vestiaires (Shelly)',
      driver: 'HTTP_RELAY',
      config: { url: `http://127.0.0.1:${RELAY_PORT}/rpc/Switch.Set?id=0&on=true&toggle_after={seconds}` },
      unlockSeconds: 4,
      isActive: true,
    },
    {
      id: 'door-zk',
      name: 'Tourniquet ZKTeco',
      driver: 'ZKTECO',
      config: { ip: '127.0.0.1', port: ZK_PORT, timeoutMs: 3000 },
      unlockSeconds: 5,
      isActive: true,
    },
    {
      id: 'door-zk-offline',
      name: 'Terminal débranché',
      driver: 'ZKTECO',
      config: { ip: '127.0.0.1', port: ZK_PORT + 1, timeoutMs: 1500 },
      unlockSeconds: 3,
      isActive: true,
    },
  ]);

  socket.on('heartbeat', (payload) => {
    checks['heartbeat received'] = true;
    log('heartbeat', payload);
  });

  socket.on('members.sync', (_payload, ack) => {
    checks['members.sync answered'] = true;
    log('members.sync requested');
    ack([
      { deviceUid: 1, name: 'Sami Ben Ali', cardNumber: '3000000123', active: true },
      { deviceUid: 2, name: 'Rania Trabelsi', cardNumber: null, active: false },
    ]);
  });

  socket.on('device.events', (payload, ack) => {
    log('device.events', payload);
    if (payload?.doorId === 'door-sim' && payload?.events?.length) checks['buffered punches delivered'] = true;
    if (payload?.doorId === 'door-zk' && payload?.events?.some((e: { deviceUserId: string }) => e.deviceUserId === '1')) {
      checks['fake terminal: live punch forwarded'] = true;
    }
    ack({ accepted: payload?.events?.length ?? 0 });
  });

  socket.on('qr.scanned', async (payload, ack) => {
    log('qr.scanned', payload);
    const granted = typeof payload?.code === 'string' && payload.code.startsWith('MLR1.');
    ack({
      granted,
      reason: granted ? undefined : 'QR code invalide.',
      door: { id: payload.doorId, name: 'Entrée (simulation)' },
      member: granted ? { id: 'm1', fullName: 'Sami Ben Ali', memberCode: 'MEL-00001', validUntil: '2026-12-31' } : undefined,
      at: new Date().toISOString(),
    });
    if (granted) {
      const result = await open(socket, payload.doorId, 5);
      if (result?.ok) checks['qr.scanned answered and door opened'] = true;
    }
  });

  setTimeout(async () => {
    checks['simulator door opened'] = (await open(socket, 'door-sim', 5))?.ok === true;
    checks['relay door opened'] = (await open(socket, 'door-relay', 4))?.ok === true;
    await open(socket, 'door-zk', 5);
    const offline = await open(socket, 'door-zk-offline', 3);
    checks['unreachable ZKTeco reported as failure'] = offline?.ok === false && typeof offline.error === 'string';
    const unknown = await open(socket, 'door-unknown', 3);
    checks['unknown door refused'] = unknown?.ok === false;
  }, 2500);
});

async function open(socket: import('socket.io').Socket, doorId: string, seconds: number) {
  try {
    const ack = await socket.timeout(8000).emitWithAck('door.open', { requestId: `req-${doorId}-${Date.now()}`, doorId, seconds });
    log(`door.open ${doorId} ->`, ack);
    return ack as { ok: boolean; error?: string };
  } catch (err) {
    log(`door.open ${doorId} timed out`, { error: (err as Error).message });
    return null;
  }
}

httpServer.listen(PORT, '127.0.0.1', () => log(`listening on http://127.0.0.1:${PORT} (path /agent-socket, namespace /agents)`));

function finish(): void {
  const failed = Object.entries(checks).filter(([, ok]) => !ok);
  for (const [name, ok] of Object.entries(checks)) console.log(`[mock] ${ok ? 'PASS' : 'FAIL'} ${name}`);
  console.log(`[mock] RESULT ${failed.length === 0 ? 'ALL PASSED' : `${failed.length} FAILED`}`);
  io.close();
  relay.close();
  terminal.close();
  process.exit(failed.length === 0 ? 0 : 1);
}

if (DURATION > 0) setTimeout(finish, DURATION);
process.on('SIGINT', finish);
