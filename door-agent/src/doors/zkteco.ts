import Zkteco from 'zkteco-js';
import { CommandQueue, sleep, withTimeout } from '../command-queue';
import { ZK_TIMEOUT_MIN_MS } from '../config';
import { errorMessage } from '../logger';
import type { AgentDoorConfig, DeviceEventMethod, DeviceUserSync } from '../types/contracts';
import type { DoorDriver, DriverContext, DriverStatus, UserSyncResult } from './driver';
import { ManagedUsers } from './managed-users';
import {
  buildDeleteUserPayload,
  buildRegEventPayload,
  buildUnlockPayload,
  buildUserPacket72,
  decodeAttendanceEvent,
  deviceName,
  MAX_DEVICE_UID,
  parseCardNumber,
  parseUserList72,
  replyName,
  USER_LIST_REQUEST,
  ZK_COMMANDS,
  ZK_EVENT,
  ZK_PRIVILEGE,
  ZK_REPLY,
  ZkTcpReader,
  type ZkAttendance,
  type ZkPacket,
  type ZkUserRecord,
} from './zk-protocol';

export interface ZktecoConfig {
  ip: string;
  port: number;
  timeoutMs: number;
  inport: number;
  /** The verify mode of live punches is not decoded: what to report them as. */
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
    timeoutMs: Number.isFinite(timeoutMs) && timeoutMs >= ZK_TIMEOUT_MIN_MS ? timeoutMs : defaults.timeoutMs,
    inport: Number(raw.inport ?? defaults.inport),
    punchMethod: punchMethod === 'FINGERPRINT' ? 'FINGERPRINT' : 'CARD',
    syncUsers: raw.syncUsers !== false,
    realtime: raw.realtime !== false,
  };
}

/** The terminal answered a command with something else than CMD_ACK_OK; the connection itself is fine. */
export class TerminalRefusal extends Error {
  constructor(readonly reply: number) {
    super(`the terminal answered ${replyName(reply)}`);
    this.name = 'TerminalRefusal';
  }
}

type State = 'idle' | 'connecting' | 'connected' | 'stopped';
type TerminalUser = Required<ZkUserRecord>;

/** A member of the members.sync answer, as the agent writes it on the terminal. */
interface WantedUser {
  member: DeviceUserSync;
  userId: string;
  name: string;
  card: number;
}

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
  /** Takes the answer to the command in flight (see command()). */
  private replyWaiter: ((packet: ZkPacket) => void) | null = null;
  private managed: ManagedUsers | null = null;

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
    const configured = this.door.config.timeoutMs;
    if (configured !== undefined && configured !== null && Number(configured) !== this.cfg.timeoutMs) {
      this.ctx.logger.warn('ignoring config.timeoutMs', { timeoutMs: configured, minimum: ZK_TIMEOUT_MIN_MS, using: this.cfg.timeoutMs });
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
        () => this.command(client, ZK_COMMANDS.UNLOCK, buildUnlockPayload(seconds)),
        this.cfg!.timeoutMs,
        'unlock',
      );
      this.ctx.logger.info('door unlocked by terminal relay', { seconds });
    } catch (err) {
      // A refusal comes over a working connection: only a lost answer calls for a reconnection.
      if (!(err instanceof TerminalRefusal)) this.handleCommandFailure(err);
      throw new Error(`Terminal did not confirm the unlock: ${errorMessage(err)}`);
    }
  }

  /**
   * Mirrors the member list on the terminal. Only the users the agent manages are changed (see
   * ManagedUsers); a member whose PIN is taken by a user made on the terminal is skipped.
   */
  async syncUsers(users: DeviceUserSync[]): Promise<UserSyncResult> {
    const result: UserSyncResult = { created: 0, updated: 0, disabled: 0, deleted: 0, unchanged: 0, skipped: 0 };
    if (!this.cfg?.syncUsers) {
      result.skipped = users.length;
      return result;
    }
    const client = await this.ensureConnected();
    const run = <T>(task: () => Promise<T>, label: string, timeoutMs = this.cfg!.timeoutMs) =>
      this.queue.run(task, timeoutMs, label);
    const log = this.ctx.logger;
    const managed = this.managedUsers();
    const conflicts: { deviceUserId: string; name: string; admin: boolean }[] = [];
    const refused: { deviceUserId: string; change: string; reply: string }[] = [];
    let listed = false;
    let saved = true;

    /** Sends one user change; false when the terminal refused it (the other members still sync). */
    const write = async (deviceUserId: string, change: string, command: number, payload: Buffer): Promise<boolean> => {
      try {
        await run(() => this.command(client, command, payload), `${change} user`);
        return true;
      } catch (err) {
        if (!(err instanceof TerminalRefusal)) throw err;
        refused.push({ deviceUserId, change, reply: replyName(err.reply) });
        return false;
      }
    };

    try {
      const onDevice = await run(() => readUsers(client), 'get users', 60_000);
      listed = true;
      const byUserId = new Map(onDevice.map((user) => [user.userId, user]));
      const usedUids = new Set(onDevice.map((user) => user.uid));
      const policy = this.ctx.config.inactivePolicy;
      const firstSync = !managed.persisted;
      managed.retain(byUserId); // users deleted on the terminal are no longer the agent's
      let changed = 0;

      const wanted: WantedUser[] = [];
      for (const member of users) {
        if (!Number.isInteger(member.deviceUid) || member.deviceUid < 1 || member.deviceUid > 999_999_999) {
          result.skipped++;
          continue;
        }
        const userId = String(member.deviceUid);
        wanted.push({ member, userId, name: deviceName(member.name), card: parseCardNumber(member.cardNumber) });
      }

      // A user the agent has no record of is still the member's when it carries the member's badge
      // or name: written by an earlier version of the agent, or enrolled by hand for that member.
      // On the first sync of a terminal such a version kept up to date, members without badge nor
      // Latin letters in their name are recognised too: written exactly as that version did.
      const legacy = firstSync && wanted.some((want) => holdsMember(byUserId.get(want.userId), want));
      let adopted = 0;
      for (const want of wanted) {
        const user = byUserId.get(want.userId);
        if (!user || managed.has(want.userId)) continue;
        if (holdsMember(user, want) || (legacy && isPlainUser(user) && user.name === want.name && user.card === want.card)) {
          managed.add(want.userId);
          adopted++;
        }
      }
      // Recorded before they are written, so a restart cannot turn them into users made by hand.
      const creations = wanted.filter((want) => want.member.active && !byUserId.has(want.userId));
      creations.forEach((want) => managed.add(want.userId));
      if (managed.changed || firstSync) saved = this.saveManagedUsers(managed);
      if (!saved) creations.forEach((want) => managed.delete(want.userId));
      if (adopted) log.info('terminal users recognised as members, now kept in sync', { count: adopted });

      for (const want of wanted) {
        const { member, userId } = want;
        const existing = byUserId.get(userId);
        if (existing && (!managed.has(userId) || !isPlainUser(existing))) {
          // Made on the terminal (staff, installer) or an administrator there: never modified.
          conflicts.push({ deviceUserId: userId, name: existing.name, admin: !isPlainUser(existing) });
          result.skipped++;
          continue;
        }

        if (!member.active && (!existing || policy === 'delete')) {
          if (!existing) {
            result.unchanged++;
          } else if (await write(userId, 'delete', ZK_COMMANDS.DELETE_USER, buildDeleteUserPayload(existing.uid))) {
            managed.delete(userId);
            result.deleted++;
            changed++;
          } else {
            result.skipped++;
          }
          continue;
        }

        const uid = existing?.uid ?? allocateUid(member.deviceUid, usedUids);
        if (uid === null || (!existing && !saved)) {
          managed.delete(userId);
          result.skipped++;
          continue;
        }
        usedUids.add(uid);
        const privilege = member.active ? ZK_PRIVILEGE.DEFAULT : ZK_PRIVILEGE.DISABLED;

        if (existing && existing.name === want.name && existing.card === want.card && existing.privilege === privilege) {
          result.unchanged++;
          continue;
        }
        const packet = buildUserPacket72({
          uid,
          userId,
          name: want.name,
          privilege,
          card: want.card,
          password: existing?.password ?? '',
          groupId: existing?.groupId ?? '',
        });
        if (!(await write(userId, existing ? (member.active ? 'update' : 'disable') : 'create', ZK_COMMANDS.USER_WRQ, packet))) {
          if (!existing) managed.delete(userId);
          result.skipped++;
          continue;
        }
        changed++;
        if (!existing) result.created++;
        else if (!member.active) result.disabled++;
        else result.updated++;
      }

      if (changed > 0) {
        await run(() => this.command(client, ZK_COMMANDS.REFRESH_DATA, ''), 'refresh data').catch((err) => {
          if (!(err instanceof TerminalRefusal)) throw err;
          log.warn('terminal refused to refresh its user data', { reply: replyName(err.reply) });
        });
      }
      return result;
    } catch (err) {
      this.handleCommandFailure(err);
      throw err;
    } finally {
      if (listed && saved && managed.changed) this.saveManagedUsers(managed);
      if (conflicts.length) log.warn('members skipped: their PIN belongs to a terminal user the agent does not manage', { users: conflicts });
      if (refused.length) log.warn('terminal refused member changes', { changes: refused });
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
      const socket = client.ztcp.socket;
      if (client.connectionType !== 'tcp' || !socket) throw new Error('no TCP connection (the agent needs the TCP SDK of the terminal)');
      // zkteco-js listens to 'error' once; keep a listener so a late socket error cannot crash the agent.
      socket.on('error', (err) => {
        this.lastError = errorMessage(err);
      });
      // Our own reading of the stream: zkteco-js decodes one packet per socket read (a burst of
      // badges loses all punches but the first) and resolves commands on any answer, even a refusal.
      const reader = new ZkTcpReader();
      socket.on('data', (chunk: Buffer) => {
        try {
          for (const packet of reader.push(chunk)) this.onPacket(client, packet);
        } catch (err) {
          this.ctx.logger.warn('unreadable data from the terminal', { error: errorMessage(err) });
        }
      });
      this.client = client;
      this.state = 'connected';
      this.attempt = 0;
      this.lastError = null;
      this.ctx.logger.info('connected to terminal', { ip, port, transport: client.connectionType });

      if (this.cfg.realtime) {
        await this.queue
          .run(() => this.command(client, ZK_COMMANDS.REG_EVENT, buildRegEventPayload()), timeoutMs, 'subscribe punches')
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

  /**
   * Sends a command that changes the terminal and checks its answer, taken from our packet reader:
   * zkteco-js resolves on the first bytes received, whatever they are (a punch, CMD_ACK_ERROR).
   */
  private async command(client: Zkteco, command: number, payload: Buffer | string): Promise<void> {
    const answer = new Promise<ZkPacket>((resolve) => {
      this.replyWaiter = resolve;
    });
    await client.executeCmd(command, payload);
    const reply = await answer;
    if (reply.command !== ZK_REPLY.ACK_OK) throw new TerminalRefusal(reply.command);
  }

  /** Every packet from the terminal: live punches, else the answer to the command in flight. */
  private onPacket(client: Zkteco, packet: ZkPacket): void {
    if (client !== this.client) return;
    if (packet.command === ZK_COMMANDS.REG_EVENT) {
      if (packet.session !== ZK_EVENT.ATTLOG || !this.cfg?.realtime) return;
      const punch = decodeAttendanceEvent(packet.payload);
      if (punch) this.onPunch(punch);
      else this.ctx.logger.warn('unreadable punch from the terminal', { bytes: packet.payload.length });
      return;
    }
    const waiter = this.replyWaiter;
    this.replyWaiter = null;
    waiter?.(packet);
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
    this.replyWaiter = null;
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

  private onPunch(punch: ZkAttendance): void {
    const at = (punch.at ?? new Date()).toISOString();
    const key = `${punch.userId}|${at}`;
    if (this.recentPunches.includes(key)) return;
    this.recentPunches.push(key);
    if (this.recentPunches.length > 200) this.recentPunches.shift();
    this.ctx.logger.info('punch on terminal', { deviceUserId: punch.userId, at });
    this.ctx.hooks.onPunch(this.door.id, { deviceUserId: punch.userId, method: this.cfg!.punchMethod, at });
  }

  /** Users this agent manages on the terminal, read from DATA_DIR on the first sync. */
  private managedUsers(): ManagedUsers {
    if (!this.managed) {
      this.managed = new ManagedUsers(ManagedUsers.fileFor(this.ctx.config.dataDir, this.door.id), this.door.id);
      const problem = this.managed.load();
      if (problem) this.ctx.logger.warn('managed terminal users unreadable, rebuilding the list', { file: this.managed.file, error: problem });
    }
    return this.managed;
  }

  /** False (and logged) when the disk refuses it. */
  private saveManagedUsers(managed: ManagedUsers): boolean {
    try {
      managed.save();
      return true;
    } catch (err) {
      this.ctx.logger.error('cannot save the managed terminal users: no member enrolled until it works', {
        file: managed.file,
        error: errorMessage(err),
      });
      return false;
    }
  }
}

/** The user table, decoded by the agent: zkteco-js getUsers reads 24-character names into the card number. */
async function readUsers(client: Zkteco): Promise<TerminalUser[]> {
  await client.ztcp.freeData();
  const { data, err } = await client.ztcp.readWithBuffer(USER_LIST_REQUEST);
  await client.ztcp.freeData();
  if (err) throw err;
  return parseUserList72(data);
}

/** Plain user, enabled or disabled: not an enroller, manager or administrator. */
function isPlainUser(user: TerminalUser): boolean {
  return (user.privilege & ~ZK_PRIVILEGE.DISABLED) === ZK_PRIVILEGE.DEFAULT;
}

/** A plain terminal user carrying the member's badge number or terminal name. */
function holdsMember(user: TerminalUser | undefined, want: WantedUser): boolean {
  if (!user || !isPlainUser(user)) return false;
  return (want.name !== '' && user.name === want.name) || (want.card !== 0 && user.card === want.card);
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
