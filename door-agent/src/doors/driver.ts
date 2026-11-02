import type { AgentConfig } from '../config';
import type { Logger } from '../logger';
import type { AgentDoorConfig, DeviceEvent, DeviceUserSync, DoorDriverKind } from '../types/contracts';

export interface DriverStatus {
  status: 'ok' | 'error';
  error?: string;
}

export interface UserSyncResult {
  created: number;
  updated: number;
  disabled: number;
  deleted: number;
  unchanged: number;
  skipped: number;
}

/** One physical door controller. Drivers never throw from start(); open() throws on failure. */
export interface DoorDriver {
  readonly kind: DoorDriverKind;
  start(): Promise<void>;
  stop(): Promise<void>;
  open(seconds: number): Promise<void>;
  status(): DriverStatus;
  /** Only terminals that hold users (ZKTeco) implement this. */
  syncUsers?(users: DeviceUserSync[]): Promise<UserSyncResult>;
}

export interface DriverHooks {
  /** A badge / fingerprint was accepted by the terminal itself. */
  onPunch(doorId: string, event: DeviceEvent): void;
  /** Connection to the controller (re)established — good time to push members. */
  onConnected(doorId: string): void;
}

export interface DriverContext {
  config: AgentConfig;
  logger: Logger;
  hooks: DriverHooks;
}

export type DriverFactory = (door: AgentDoorConfig, ctx: DriverContext) => DoorDriver;
