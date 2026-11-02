import * as http from 'http';
import type { AddressInfo } from 'net';
import { Server, type Socket } from 'socket.io';
import type {
  AccessDecision,
  AgentDoorConfig,
  DeviceEventsPayload,
  DeviceUserSync,
  DoorOpenAck,
  HeartbeatPayload,
  QrScannedPayload,
} from '../../src/types/contracts';
import { AGENT_KEY } from './fixtures';
import { waitFor } from './net';

/**
 * Stand-in for the access-service side of the agent protocol (docs/API.md, "Door agents"):
 * namespace /agents on path /agent-socket, records what the agent sends and answers its acks.
 */
export class FakeAccessService {
  readonly heartbeats: HeartbeatPayload[] = [];
  readonly deviceEvents: DeviceEventsPayload[] = [];
  readonly qrScans: QrScannedPayload[] = [];
  memberSyncRequests = 0;
  /** Answer to members.sync. */
  members: DeviceUserSync[] = [];
  socket: Socket | null = null;

  private constructor(
    private readonly io: Server,
    readonly port: number,
  ) {
    const agents = io.of('/agents');
    agents.use((socket, next) => (socket.handshake.auth?.key === AGENT_KEY ? next() : next(new Error('Invalid agent key'))));
    // Listeners are attached on connection, before the agent can emit anything.
    agents.on('connection', (socket) => {
      this.socket = socket;
      socket.on('heartbeat', (payload: HeartbeatPayload) => this.heartbeats.push(payload));
      socket.on('device.events', (payload: DeviceEventsPayload, ack: (result: { accepted: number }) => void) => {
        this.deviceEvents.push(payload);
        ack({ accepted: payload.events.length });
      });
      socket.on('members.sync', (_payload: unknown, ack: (users: DeviceUserSync[]) => void) => {
        this.memberSyncRequests++;
        ack(this.members);
      });
      socket.on('qr.scanned', (payload: QrScannedPayload, ack: (decision: AccessDecision) => void) => {
        this.qrScans.push(payload);
        ack({ granted: payload.code.startsWith('MLR1.'), door: { id: payload.doorId, name: payload.doorId }, at: new Date().toISOString() });
      });
    });
  }

  /** Listens on 127.0.0.1, on the given port or an OS-assigned one. */
  static async start(port = 0): Promise<FakeAccessService> {
    const httpServer = http.createServer();
    const io = new Server(httpServer, { path: '/agent-socket' });
    await new Promise<void>((resolve, reject) => {
      httpServer.once('error', reject);
      httpServer.listen(port, '127.0.0.1', resolve);
    });
    return new FakeAccessService(io, (httpServer.address() as AddressInfo).port);
  }

  get url(): string {
    return `http://127.0.0.1:${this.port}`;
  }

  connected(): Promise<Socket> {
    return waitFor(() => (this.socket?.connected ? this.socket : null), 'the agent connection');
  }

  /** Pushes the door list and waits until the agent has applied it (it then sends a heartbeat). */
  async pushDoors(doors: AgentDoorConfig[]): Promise<HeartbeatPayload> {
    const socket = await this.connected();
    const seen = this.heartbeats.length;
    socket.emit('doors', doors);
    return waitFor(
      () => this.heartbeats.slice(seen).find((heartbeat) => heartbeat.doors.length === doors.length),
      'a heartbeat listing the doors',
    );
  }

  async openDoor(command: unknown): Promise<DoorOpenAck> {
    const socket = await this.connected();
    return socket.timeout(8000).emitWithAck('door.open', command);
  }

  close(): Promise<void> {
    return new Promise((resolve) => this.io.close(() => resolve()));
  }
}
