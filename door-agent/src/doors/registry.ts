import { CommandQueue } from '../command-queue';
import { errorMessage } from '../logger';
import type { AgentDoorConfig, DeviceUserSync, DoorStatus } from '../types/contracts';
import type { DoorDriver, DriverContext, DriverFactory, UserSyncResult } from './driver';
import { HttpRelayDriver } from './http-relay';
import { SimulatorDriver } from './simulator';
import { ZktecoDriver } from './zkteco';

export const createDriver: DriverFactory = (door, ctx) => {
  switch (door.driver) {
    case 'ZKTECO':
      return new ZktecoDriver(door, ctx);
    case 'HTTP_RELAY':
      return new HttpRelayDriver(door, ctx);
    case 'SIMULATOR':
      return new SimulatorDriver(door, ctx);
    default:
      throw new Error(`Unknown door driver ${(door as { driver: string }).driver}`);
  }
};

interface Entry {
  door: AgentDoorConfig;
  driver: DoorDriver;
  signature: string;
}

/** Keeps one driver per door assigned to this agent, in line with the latest `doors` push. */
export class DoorRegistry {
  private readonly entries = new Map<string, Entry>();
  private readonly updates = new CommandQueue();

  constructor(
    private readonly ctx: DriverContext,
    private readonly factory: DriverFactory = createDriver,
  ) {}

  /** Applies a full door list: starts new drivers, restarts changed ones, stops removed ones. */
  apply(doors: AgentDoorConfig[]): Promise<{ started: string[]; stopped: string[] }> {
    return this.updates.run(async () => {
      const started: string[] = [];
      const stopped: string[] = [];
      const wanted = new Map(doors.map((door) => [door.id, door]));

      for (const [id, entry] of this.entries) {
        const next = wanted.get(id);
        if (!next || signature(next) !== entry.signature) {
          await entry.driver.stop().catch(() => undefined);
          this.entries.delete(id);
          stopped.push(id);
        }
      }

      for (const door of doors) {
        const existing = this.entries.get(door.id);
        if (existing) {
          existing.door = door; // name / unlockSeconds / isActive changes need no restart
          continue;
        }
        const logger = this.ctx.logger.child({ component: door.driver.toLowerCase(), doorId: door.id, door: door.name });
        try {
          const driver = this.factory(door, { ...this.ctx, logger });
          this.entries.set(door.id, { door, driver, signature: signature(door) });
          await driver.start();
          started.push(door.id);
        } catch (err) {
          logger.error('could not start door driver', { error: errorMessage(err) });
        }
      }
      return { started, stopped };
    });
  }

  async open(doorId: string, seconds?: number): Promise<void> {
    const entry = this.entries.get(doorId);
    if (!entry) throw new Error(`Door ${doorId} is not managed by this agent`);
    if (!entry.door.isActive) throw new Error(`Door "${entry.door.name}" is disabled`);
    const duration = seconds && seconds > 0 ? seconds : entry.door.unlockSeconds || 5;
    await entry.driver.open(duration);
  }

  /** Pushes the member list to every terminal that stores users. */
  async syncUsers(users: DeviceUserSync[]): Promise<{ doorId: string; result?: UserSyncResult; error?: string }[]> {
    const outcomes: { doorId: string; result?: UserSyncResult; error?: string }[] = [];
    for (const [doorId, entry] of this.entries) {
      if (!entry.driver.syncUsers || !entry.door.isActive || entry.driver.status().status !== 'ok') continue;
      try {
        outcomes.push({ doorId, result: await entry.driver.syncUsers(users) });
      } catch (err) {
        outcomes.push({ doorId, error: errorMessage(err) });
      }
    }
    return outcomes;
  }

  /** True when at least one active terminal that stores users is currently reachable. */
  hasConnectedUserTerminals(): boolean {
    return [...this.entries.values()].some(
      (entry) => entry.driver.syncUsers && entry.door.isActive && entry.driver.status().status === 'ok',
    );
  }

  get(doorId: string): AgentDoorConfig | undefined {
    return this.entries.get(doorId)?.door;
  }

  list(): AgentDoorConfig[] {
    return [...this.entries.values()].map((entry) => entry.door);
  }

  statuses(): DoorStatus[] {
    return [...this.entries.values()].map(({ door, driver }) => {
      if (!door.isActive) return { id: door.id, status: 'ok' as const };
      const status = driver.status();
      return status.error ? { id: door.id, status: status.status, error: status.error } : { id: door.id, status: status.status };
    });
  }

  async stopAll(): Promise<void> {
    await this.updates.run(async () => {
      for (const entry of this.entries.values()) await entry.driver.stop().catch(() => undefined);
      this.entries.clear();
    });
  }
}

function signature(door: AgentDoorConfig): string {
  return JSON.stringify([door.driver, door.config]);
}
