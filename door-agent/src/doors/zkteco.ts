import Zkteco from 'zkteco-js';
import { CommandQueue, sleep, withTimeout } from '../command-queue';
import { errorMessage } from '../logger';
import type { AgentDoorConfig, DeviceEventMethod, DeviceUserSync } from '../types/contracts';
import type { DoorDriver, DriverContext, DriverStatus, UserSyncResult } from './driver';
import {
  buildDeleteUserPayload,
  buildUnlockPayload,
  buildUserPacket72,
  deviceName,
  MAX_DEVICE_UID,
  parseCardNumber,
  ZK_COMMANDS,
  ZK_PRIVILEGE,
} from './zk-protocol';

export interface ZktecoConfig {
  ip: string;
  port: number;
  timeoutMs: number;
  inport: number;
  /** zkteco-js does not decode the verify mode of live punches: what to report them as. */
  punchMethod: DeviceEventMethod;
  /** Push members to the terminal (enrol / disable). Turn off for exit-only readers. */
  syncUsers: boolean;
  /** Forward live punches to the server. */
  realtime: boolean;
}

export function parseZktecoConfig(
  raw: Record<string, unknown>,
  defaults: { timeoutMs: number; inport: number },
): ZktecoConfig {
  const ip = typeof raw.ip === 'string' ? raw.ip.trim() : '';
  if (!ip) throw new Error('ZKTECO door needs config.ip (e.g. "192.168.1.201")');
  const port = Number(raw.port ?? 4370);
  if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error(`Invalid ZKTeco port ${raw.port}`);
  const timeoutMs = Number(raw.timeoutMs ?? defaults.timeoutMs);
  const punchMethod = String(raw.punchMethod ?? 'CARD').toUpperCase();
  return {
    ip,
    port,
    timeoutMs: Number.isFinite(timeoutMs) && timeoutMs >= 500 ? timeoutMs : defaults.timeoutMs,
    inport: Number(raw.inport ?? defaults.inport),
    punchMethod: punchMethod === 'FINGERPRINT' ? 'FINGERPRINT' : 'CARD',
    syncUsers: raw.syncUsers !== false,
    realtime: raw.realtime !== false,
  };
}

type State = 'idle' | 'connecting' | 'connected' | 'stopped';

/**
 * ZKTeco standalone terminal / access controller (F22, SpeedFace, inBio with TCP SDK...).
 * Keeps one persistent connection with exponential reconnect, serialises every command,
 * forwards live punches and mirrors the member list on the terminal.
 */
export class ZktecoDriver implements DoorDriver {
  readonly kind = 'ZKTECO' as const;
  private readonly cfg: ZktecoConfig | null;
  private readonly queue = new CommandQueue();
  private client: Zkteco | null = null;
  private state: State = 'idle';
  private attempt = 0;
  private lastError: string | null = null;
  private reconnectTimer: NodeJS.Timeout | null = null;
  private keepAliveTimer: NodeJS.Timeout | null = null;
  private readonly recentPunches: string[] = [];

  constructor(
    private readonly door: AgentDoorConfig,
    private readonly ctx: DriverContext,
  ) {
    try {
      this.cfg = parseZktecoConfig(door.config, ctx.config.zk);
    } catch (err) {
      this.cfg = null;
      this.lastError = errorMessage(err);
    }
  }

  async start(): Promise<void> {
    if (!this.cfg) {
      this.ctx.logger.error('invalid ZKTeco configuration', { error: this.lastError });
      return;
    }
    this.state = 'idle';
    void this.connect();
  }

  async stop(): Promise<void> {
    this.state = 'stopped';
    if (this.reconnectTimer) clearTimeout(this.reconnectTimer);
    this.stopKeepAlive();
    const client = this.client;
    this.client = null;
    if (client) {
      await withTimeout(client.disconnect(), 3000, 'disconnect').catch(() => undefined);
      destroy(client);
    }
  }

  status(): DriverStatus {
    if (this.state === 'connected') return { status: 'ok' };
    return { status: 'error', error: this.lastError ?? `terminal ${this.state}` };
  }

  async open(seconds: number): Promise<void> {
    const client = await this.ensureConnected();
    try {
      await this.queue.run(
        () => client.executeCmd(ZK_COMMANDS.UNLOCK, buildUnlockPayload(seconds)),
        this.cfg!.timeoutMs,
        'unlock',
      );
      this.ctx.logger.info('door unlocked by terminal relay', { seconds });
    } catch (err) {
      this.handleCommandFailure(err);
      throw new Error(`Terminal did not confirm the unlock: ${errorMessage(err)}`);
    }
  }

  async syncUsers(users: DeviceUserSync[]): Promise<UserSyncResult> {
    const result: UserSyncResult = { created: 0, updated: 0, disabled: 0, deleted: 0, unchanged: 0, skipped: 0 };
    if (!this.cfg?.syncUsers) {
      result.skipped = users.length;
      return result;
    }
    const client = await this.ensureConnected();
    const run = <T>(task: () => Promise<T>, label: string, timeoutMs = this.cfg!.timeoutMs) =>
      this.queue.run(task, timeoutMs, label);

    try {
      const { data: onDevice } = await run(() => client.getUsers(), 'get users', 60_000);
      const byUserId = new Map(onDevice.map((user) => [user.userId, user]));
      const usedUids = new Set(onDevice.map((user) => user.uid));
      const policy = this.ctx.config.inactivePolicy;
      let changed = 0;

      for (const member of users) {
        if (!Number.isInteger(member.deviceUid) || member.deviceUid < 1 || member.deviceUid > 999_999_999) {
          result.skipped++;
          continue;
        }
        const userId = String(member.deviceUid);
        const existing = byUserId.get(userId);

        if (!member.active && (!existing || policy === 'delete')) {
          if (existing) {
            await run(() => client.executeCmd(ZK_COMMANDS.DELETE_USER, buildDeleteUserPayload(existing.uid)), 'delete user');
            result.deleted++;
            changed++;
          } else {
            result.unchanged++;
          }
          continue;
        }

        const uid = existing?.uid ?? allocateUid(member.deviceUid, usedUids);
        if (uid === null) {
          result.skipped++;
          continue;
        }
        usedUids.add(uid);
        // Keep elevated privileges set on the terminal; only toggle the "disabled" bit.
        const basePrivilege = (existing?.role ?? ZK_PRIVILEGE.DEFAULT) & ~ZK_PRIVILEGE.DISABLED;
        const privilege = member.active ? basePrivilege : basePrivilege | ZK_PRIVILEGE.DISABLED;
        const name = deviceName(member.name);
        const card = parseCardNumber(member.cardNumber);

        if (existing && existing.name === name && existing.cardno === card && existing.role === privilege) {
          result.unchanged++;
          continue;
        }
        await run(
          () =>
            client.executeCmd(
              ZK_COMMANDS.USER_WRQ,
              buildUserPacket72({ uid, userId, name, privilege, card, password: existing?.password ?? '' }),
            ),
          'write user',
        );
        changed++;
        if (!existing) result.created++;
        else if (!member.active) result.disabled++;
        else result.updated++;
      }

      if (changed > 0) await run(() => client.executeCmd(ZK_COMMANDS.REFRESH_DATA, ''), 'refresh data');
      return result;
    } catch (err) {
      this.handleCommandFailure(err);
      throw err;
    }
  }

  private async connect(): Promise<void> {
    if (!this.cfg || this.state !== 'idle') return;
    this.state = 'connecting';
    const { ip, port, timeoutMs, inport } = this.cfg;
    const client = new Zkteco(ip, port, timeoutMs, inport);
    try {
      await withTimeout(
        client.createSocket(
          (err) => {
            this.lastError = errorMessage(err);
          },
          () => this.onClosed(client),
        ),
        timeoutMs + 1000,
        'connect',
      );
      if ((this.state as State) === 'stopped') {
        destroy(client);
        return;
      }
      // zkteco-js listens to 'error' once; keep a listener so a late socket error cannot crash the agent.
      client.ztcp.socket?.on('error', (err) => {
        this.lastError = errorMessage(err);
      });
      this.client = client;
      this.state = 'connected';
      this.attempt = 0;
      this.lastError = null;
      this.ctx.logger.info('connected to terminal', { ip, port, transport: client.connectionType });

      if (this.cfg.realtime) {
        await this.queue
          .run(
            async () => {
              await client.getRealTimeLogs((log) => this.onPunch(log));
              // zkteco-js does not wait for the terminal's ACK of the subscription: let it arrive
              // now so it cannot be mistaken for the reply of the next queued command.
              await sleep(400);
            },
            timeoutMs,
            'subscribe punches',
          )
          .catch((err) => this.ctx.logger.warn('live punches unavailable', { error: errorMessage(err) }));
      }
      this.startKeepAlive();
      this.ctx.hooks.onConnected(this.door.id);
    } catch (err) {
      destroy(client);
      if ((this.state as State) === 'stopped') return;
      this.state = 'idle';
      this.lastError = errorMessage(err);
      this.ctx.logger.warn('terminal unreachable', { ip, port, error: this.lastError });
      this.scheduleReconnect();
    }
  }

  private onClosed(client: Zkteco): void {
    if (this.client !== client || this.state === 'stopped') return;
    this.ctx.logger.warn('terminal connection closed');
    this.dropConnection();
  }

  private handleCommandFailure(err: unknown): void {
    this.lastError = errorMessage(err);
    if (this.state === 'connected') {
      this.ctx.logger.warn('command failed, reconnecting to terminal', { error: this.lastError });
      this.dropConnection();
    }
  }

  private dropConnection(): void {
    const client = this.client;
    this.client = null;
    this.stopKeepAlive();
    if (client) destroy(client);
    if (this.state !== 'stopped') {
      this.state = 'idle';
      this.scheduleReconnect();
    }
  }

  private scheduleReconnect(): void {
    if (this.state === 'stopped' || this.reconnectTimer) return;
    const delay = Math.min(30_000, 1000 * 2 ** this.attempt);
    this.attempt++;
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      void this.connect();
    }, delay);
  }

  /** Waits for a live connection (triggering a connect attempt when idle). */
  private async ensureConnected(): Promise<Zkteco> {
    if (!this.cfg) throw new Error(this.lastError ?? 'ZKTeco door not configured');
    if (this.state === 'stopped') throw new Error('Door driver stopped');
    if (this.state === 'idle') {
      if (this.reconnectTimer) {
        clearTimeout(this.reconnectTimer);
        this.reconnectTimer = null;
      }
      void this.connect();
    }
    const deadline = Date.now() + this.cfg.timeoutMs + 1500;
    let attempting = (this.state as State) === 'connecting';
    while (Date.now() < deadline) {
      if (this.state === 'connected' && this.client) return this.client;
      if (this.state === 'connecting') attempting = true;
      else if (attempting && this.state === 'idle') break; // the attempt failed
      await sleep(100);
    }
    throw new Error(`Terminal ${this.cfg.ip}:${this.cfg.port} unreachable${this.lastError ? ` (${this.lastError})` : ''}`);
  }

  private startKeepAlive(): void {
    this.stopKeepAlive();
    this.keepAliveTimer = setInterval(() => {
      const client = this.client;
      if (!client || this.state !== 'connected') return;
      this.queue
        .run(() => client.getTime(), this.cfg!.timeoutMs, 'keep-alive')
        .catch((err) => this.handleCommandFailure(err));
    }, this.ctx.config.zk.keepAliveMs);
  }

  private stopKeepAlive(): void {
    if (this.keepAliveTimer) clearInterval(this.keepAliveTimer);
    this.keepAliveTimer = null;
  }

  private onPunch(log: { userId: string; attTime: Date }): void {
    const userId = String(log.userId ?? '').trim();
    if (!userId) return;
    const at =
      log.attTime instanceof Date && !Number.isNaN(log.attTime.getTime())
        ? log.attTime.toISOString()
        : new Date().toISOString();
    const key = `${userId}|${at}`;
    if (this.recentPunches.includes(key)) return;
    this.recentPunches.push(key);
    if (this.recentPunches.length > 200) this.recentPunches.shift();
    this.ctx.logger.info('punch on terminal', { deviceUserId: userId, at });
    this.ctx.hooks.onPunch(this.door.id, { deviceUserId: userId, method: this.cfg!.punchMethod, at });
  }
}

/** Terminal slot for a new user: the member deviceUid when free, otherwise the first free slot. */
export function allocateUid(preferred: number, used: Set<number>): number | null {
  if (preferred >= 1 && preferred <= MAX_DEVICE_UID && !used.has(preferred)) return preferred;
  for (let uid = 1; uid <= MAX_DEVICE_UID; uid++) {
    if (!used.has(uid)) return uid;
  }
  return null;
}

function destroy(client: Zkteco): void {
  try {
    client.ztcp?.socket?.destroy();
  } catch {
    /* already closed */
  }
  try {
    client.zudp?.socket?.close();
  } catch {
    /* already closed */
  }
}
