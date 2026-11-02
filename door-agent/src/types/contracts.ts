/**
 * Local mirror of the access-service agent protocol (docs/API.md, "Door agents").
 * Kept in sync by hand: the door agent is deployed on its own and never imports backend code.
 */
export type DoorDriverKind = 'ZKTECO' | 'HTTP_RELAY' | 'SIMULATOR';

/** server → agent `doors` */
export interface AgentDoorConfig {
  id: string;
  name: string;
  driver: DoorDriverKind;
  config: Record<string, unknown>;
  unlockSeconds: number;
  isActive: boolean;
}

/** server → agent `door.open` */
export interface DoorOpenCommand {
  requestId: string;
  doorId: string;
  seconds: number;
}

export interface DoorOpenAck {
  ok: boolean;
  error?: string;
}

/** agent → server `qr.scanned` */
export interface QrScannedPayload {
  doorId: string;
  code: string;
}

/** ack of `qr.scanned` */
export interface AccessDecision {
  granted: boolean;
  reason?: string;
  door?: { id: string; name: string };
  member?: { id: string; fullName: string; memberCode: string; validUntil: string | null };
  at: string;
  logId?: string;
}

export type DeviceEventMethod = 'CARD' | 'FINGERPRINT';

export interface DeviceEvent {
  /** User PIN on the terminal = member deviceUid. */
  deviceUserId: string;
  method: DeviceEventMethod;
  at: string;
}

/** agent → server `device.events` */
export interface DeviceEventsPayload {
  doorId: string;
  events: DeviceEvent[];
}

export interface DeviceEventsAck {
  accepted: number;
}

/** ack of `members.sync` */
export interface DeviceUserSync {
  deviceUid: number;
  name: string;
  cardNumber: string | null;
  active: boolean;
}

export interface DoorStatus {
  id: string;
  status: 'ok' | 'error';
  error?: string;
}

/** agent → server `heartbeat` */
export interface HeartbeatPayload {
  version: string;
  doors: DoorStatus[];
}
