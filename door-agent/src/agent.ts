import * as fs from 'fs';
import * as path from 'path';
import type { Server } from 'http';
import { io, Socket } from 'socket.io-client';
import type { AgentConfig } from './config';
import { DoorRegistry } from './doors/registry';
import { EventBuffer } from './events/event-buffer';
import { errorMessage, Logger } from './logger';
import { startHttpScanServer } from './scan/http-scan-server';
import { ScanHandler } from './scan/scan-handler';
import { startStdinScanner } from './scan/stdin-scanner';
import type {
  AccessDecision,
  AgentDoorConfig,
  DeviceEventsAck,
  DeviceEventsPayload,
  DeviceUserSync,
  DoorOpenAck,
  DoorOpenCommand,
  HeartbeatPayload,
  QrScannedPayload,
} from './types/contracts';

const ACK_TIMEOUT_MS = 10_000;
const SYNC_TIMEOUT_MS = 30_000;

/**
 * The door agent: one outbound Socket.IO connection to the access-service (through the
 * gateway's /agent-socket path), the door drivers, the punch buffer and the local scan inputs.
 */
export class DoorAgent {
  private readonly socket: Socket;
  private readonly registry: DoorRegistry;
  private readonly buffer: EventBuffer;
  private readonly scans: ScanHandler;
  private readonly timers: NodeJS.Timeout[] = [];
  private scanServer: Server | null = null;
  private stopStdin: (() => void) | null = null;
  private flushing = false;
  private flushRetry: NodeJS.Timeout | null = null;
  private flushFailures = 0;
  private syncing = false;
  private syncAgain = false;
  private lastSyncAt: string | null = null;

  constructor(
    private readonly config: AgentConfig,
    private readonly logger: Logger,
    private readonly version: string,
  ) {
    fs.mkdirSync(config.dataDir, { recursive: true });
    this.buffer = new EventBuffer({
      max: config.eventBufferMax,
      file: path.join(config.dataDir, 'pending-events.json'),
    });

    this.registry = new DoorRegistry({
      config,
      logger,
      hooks: {
        onPunch: (doorId, event) => {
          if (this.buffer.push(doorId, event)) void this.flushEvents();
        },
        onConnected: () => void this.syncMembers('terminal connected'),
      },
    });

    this.scans = new ScanHandler(
      (doorId, code) => this.verifyQr(doorId, code),
      (requested) => this.resolveDoor(requested),
      logger.child({ component: 'scan' }),
    );

    this.socket = io(`${config.serverUrl}/agents`, {
      path: '/agent-socket',
      auth: { key: config.agentKey },
      transports: ['websocket'],
      reconnection: true,
      reconnectionDelay: 1000,
      reconnectionDelayMax: 15_000,
      autoConnect: false,
    });
  }

  start(): void {
    const restored = this.buffer.load();
    if (restored) this.logger.info('restored pending terminal punches', { count: restored });

    this.bindSocket();
    this.socket.connect();
    this.logger.info('connecting to server', { url: `${this.config.serverUrl}/agents`, version: this.version });

    this.timers.push(setInterval(() => this.sendHeartbeat(), this.config.heartbeatIntervalMs));
    this.timers.push(setInterval(() => void this.syncMembers('periodic'), this.config.syncIntervalMs));
    this.timers.push(setInterval(() => void this.flushEvents(), 60_000));

    if (this.config.scanStdin) {
      this.stopStdin = startStdinScanner((code) => void this.scans.handle(code));
    }
    if (this.config.localScan.port) {
      this.scanServer = startHttpScanServer({
        host: this.config.localScan.host,
        port: this.config.localScan.port,
        token: this.config.localScan.token,
        onScan: (code, doorId) => this.scans.handle(code, doorId),
        status: () => this.status(),
        logger: this.logger.child({ component: 'scan-http' }),
      });
    }
  }

  async stop(): Promise<void> {
    this.timers.forEach(clearInterval);
    if (this.flushRetry) clearTimeout(this.flushRetry);
    this.stopStdin?.();
    await new Promise<void>((resolve) => (this.scanServer ? this.scanServer.close(() => resolve()) : resolve()));
    this.socket.disconnect();
    await this.registry.stopAll();
    this.buffer.flushToDisk();
    this.logger.info('agent stopped', { pendingEvents: this.buffer.size });
  }

  status(): Record<string, unknown> {
    return {
      version: this.version,
      connected: this.socket.connected,
      doors: this.registry.list().map((door) => ({
        id: door.id,
        name: door.name,
        driver: door.driver,
        isActive: door.isActive,
        ...this.registry.statuses().find((status) => status.id === door.id),
      })),
      pendingEvents: this.buffer.size,
      droppedEvents: this.buffer.dropped,
      lastMemberSyncAt: this.lastSyncAt,
    };
  }

  private bindSocket(): void {
    const log = this.logger.child({ component: 'socket' });

    this.socket.on('connect', () => {
      log.info('connected to access-service');
      this.sendHeartbeat();
      void this.flushEvents();
      void this.syncMembers('server connected');
    });

    this.socket.on('connect_error', (err) => {
      log.warn('cannot reach access-service', { error: err.message });
    });

    this.socket.on('disconnect', (reason) => {
      log.warn('disconnected from access-service', { reason });
      if (reason === 'io server disconnect') {
        // The server closed the session (restart or revoked key): retry later instead of giving up.
        setTimeout(() => this.socket.connect(), 5000);
      }
    });

    this.socket.on('doors', async (doors: AgentDoorConfig[]) => {
      if (!Array.isArray(doors)) return;
      const { started, stopped } = await this.registry.apply(doors);
      log.info('door configuration received', {
        doors: doors.map((door) => `${door.name} (${door.driver})`),
        started: started.length,
        stopped: stopped.length,
      });
      this.sendHeartbeat();
      void this.syncMembers('door configuration changed');
    });

    this.socket.on('door.open', async (command: DoorOpenCommand, ack?: (result: DoorOpenAck) => void) => {
      const reply = typeof ack === 'function' ? ack : () => undefined;
      if (!command || typeof command.doorId !== 'string') return reply({ ok: false, error: 'Invalid command' });
      const fields = { requestId: command.requestId, doorId: command.doorId, seconds: command.seconds };
      try {
        await this.registry.open(command.doorId, command.seconds);
        log.info('door opened', fields);
        reply({ ok: true });
      } catch (err) {
        log.error('door open failed', { ...fields, error: errorMessage(err) });
        reply({ ok: false, error: errorMessage(err) });
      }
    });
  }

  private resolveDoor(requested: string | null): string | null {
    if (requested) return requested;
    if (this.config.defaultDoorId) return this.config.defaultDoorId;
    const doors = this.registry.list().filter((door) => door.isActive);
    return doors.length === 1 ? doors[0].id : null;
  }

  /** Asks the server to check a QR code; the server sends `door.open` itself when granted. */
  private async verifyQr(doorId: string, code: string): Promise<AccessDecision> {
    if (!this.socket.connected) {
      return {
        granted: false,
        reason: 'Serveur injoignable : utilisez votre badge ou adressez-vous à l’accueil.',
        at: new Date().toISOString(),
      };
    }
    try {
      const payload: QrScannedPayload = { doorId, code };
      return await this.socket.timeout(ACK_TIMEOUT_MS).emitWithAck('qr.scanned', payload);
    } catch (err) {
      return { granted: false, reason: `Vérification impossible (${errorMessage(err)}).`, at: new Date().toISOString() };
    }
  }

  /** Sends buffered terminal punches, oldest first, until the buffer is empty or the server fails. */
  private async flushEvents(): Promise<void> {
    if (this.flushing || !this.socket.connected) return;
    this.flushing = true;
    const log = this.logger.child({ component: 'events' });
    try {
      for (let batch = this.buffer.nextBatch(); batch; batch = this.buffer.nextBatch()) {
        const payload: DeviceEventsPayload = { doorId: batch.doorId, events: batch.events };
        const ack: DeviceEventsAck = await this.socket.timeout(ACK_TIMEOUT_MS).emitWithAck('device.events', payload);
        this.buffer.ack(batch.keys);
        this.flushFailures = 0;
        log.info('terminal punches delivered', { doorId: batch.doorId, sent: batch.events.length, accepted: ack?.accepted });
      }
    } catch (err) {
      this.flushFailures++;
      const delay = Math.min(60_000, 5000 * 2 ** (this.flushFailures - 1));
      log.warn('could not deliver terminal punches, will retry', { pending: this.buffer.size, retryInMs: delay, error: errorMessage(err) });
      if (!this.flushRetry) {
        this.flushRetry = setTimeout(() => {
          this.flushRetry = null;
          void this.flushEvents();
        }, delay);
      }
    } finally {
      this.flushing = false;
    }
  }

  /** Mirrors the member list on the ZKTeco terminals (enrol active members, disable the others). */
  private async syncMembers(reason: string): Promise<void> {
    if (!this.socket.connected || !this.registry.hasConnectedUserTerminals()) return;
    if (this.syncing) {
      this.syncAgain = true;
      return;
    }
    this.syncing = true;
    const log = this.logger.child({ component: 'sync' });
    try {
      const users: DeviceUserSync[] = await this.socket.timeout(SYNC_TIMEOUT_MS).emitWithAck('members.sync', {});
      if (!Array.isArray(users)) throw new Error('Invalid members.sync answer');
      const outcomes = await this.registry.syncUsers(users);
      this.lastSyncAt = new Date().toISOString();
      for (const outcome of outcomes) {
        if (outcome.error) log.warn('member sync failed on terminal', { reason, doorId: outcome.doorId, error: outcome.error });
        else log.info('members synchronised on terminal', { reason, doorId: outcome.doorId, members: users.length, ...outcome.result });
      }
    } catch (err) {
      log.warn('member sync failed', { reason, error: errorMessage(err) });
    } finally {
      this.syncing = false;
      if (this.syncAgain) {
        this.syncAgain = false;
        void this.syncMembers('queued');
      }
    }
  }

  private sendHeartbeat(): void {
    if (!this.socket.connected) return;
    const payload: HeartbeatPayload = { version: this.version, doors: this.registry.statuses() };
    this.socket.emit('heartbeat', payload);
  }
}
