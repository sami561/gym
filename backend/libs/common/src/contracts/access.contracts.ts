import { Actor } from './common.contracts';

export enum DoorDriver {
  ZKTECO = 'ZKTECO',
  HTTP_RELAY = 'HTTP_RELAY',
  SIMULATOR = 'SIMULATOR',
}

export enum AccessMethod {
  QR = 'QR',
  APP = 'APP',
  CARD = 'CARD',
  FINGERPRINT = 'FINGERPRINT',
  MANUAL = 'MANUAL',
}

export enum AccessResult {
  GRANTED = 'GRANTED',
  DENIED = 'DENIED',
}

/** Rotating QR code: MLR1.<memberCode>.<step>.<sig> (see utils/access-code.ts). */
export const ACCESS_CODE_PERIOD_SECONDS = 30;

/**
 * RPC pattern of the QR secret rotation (access-service), payload RotateAccessKeyRequest,
 * result AccessKeyRotation. To move into PATTERNS.access (bus/patterns.ts) as `rotateKey`.
 */
export const ACCESS_ROTATE_KEY_PATTERN = 'access.rotate-key';

/**
 * Value of every secret in DoorDto.config (header values, basicAuth.password, keys such as
 * password / commKey / token, the same query parameters of a relay URL). Sent back unchanged
 * on an update, it keeps the stored value at that place.
 */
export const DOOR_SECRET_MASK = '********';

export interface DoorDto {
  id: string;
  name: string;
  location: string | null;
  driver: DoorDriver;
  /**
   * ZKTECO: { ip, port?, timeoutMs?, commKey? }; HTTP_RELAY: { url, method?, headers?, basicAuth?, body?,
   * timeoutMs? }; SIMULATOR: {}. Secrets are DOOR_SECRET_MASK; {} unless the caller may edit doors (ADMIN).
   */
  config: Record<string, unknown>;
  unlockSeconds: number;
  isActive: boolean;
  /** Members may open this door from the app (the Wi-Fi and geofence checks still apply). */
  allowAppOpen: boolean;
  agentId: string | null;
  agentName: string | null;
  online: boolean;
}

export interface ListDoorsRequest {
  /** Masked config for door editors (ADMIN); without it every door has config: {}. */
  includeConfig?: boolean;
}

export interface MemberDoor {
  id: string;
  name: string;
  location: string | null;
}

export interface AgentDto {
  id: string;
  name: string;
  online: boolean;
  lastSeenAt: string | null;
  doorCount: number;
}

export interface CreateAgentResult {
  agent: AgentDto;
  /** Plain API key, returned only once. */
  apiKey: string;
}

export interface CreateDoorRequest {
  name: string;
  location?: string | null;
  driver: DoorDriver;
  /** On update, a DOOR_SECRET_MASK value keeps the stored secret at that place. */
  config?: Record<string, unknown>;
  unlockSeconds?: number;
  isActive?: boolean;
  /** Defaults to true. */
  allowAppOpen?: boolean;
  agentId?: string | null;
}

export interface UpdateDoorRequest {
  id: string;
  data: Partial<CreateDoorRequest>;
}

export interface AccessLogDto {
  id: string;
  memberId: string | null;
  memberName: string | null;
  memberCode: string | null;
  doorId: string | null;
  doorName: string | null;
  method: AccessMethod;
  result: AccessResult;
  reason: string | null;
  openedById: string | null;
  openedByName: string | null;
  createdAt: string;
  /** App openings (method APP) in log lists requested with includeContext (ADMIN); null otherwise. */
  context?: AppOpenContext | null;
}

/** Where an opening from the app came from, recorded on its access log to investigate abuse. */
export interface AppOpenContext {
  latitude: number | null;
  longitude: number | null;
  /** GPS accuracy reported by the phone, in meters. */
  accuracy: number | null;
  /** Distance from the phone to the gym, in meters (null when the position was invalid). */
  distanceMeters: number | null;
  /** Address the gateway saw the request come from. */
  clientIp: string | null;
}

export interface AccessKey {
  memberCode: string;
  secret: string;
  period: number;
  format: 'MLR1.{memberCode}.{step}.{sig}';
}

export interface RotateAccessKeyRequest {
  memberId: string;
  /** Staff member (back-office) or the member (app) asking for it, for the audit log. */
  actor?: Actor;
}

/** A new QR secret: codes built with the previous one are refused from now on. */
export interface AccessKeyRotation {
  key: AccessKey;
  rotatedAt: string;
}

export interface OpenByAppRequest {
  memberId: string;
  doorId: string;
  latitude: number;
  longitude: number;
  /** GPS accuracy in meters, if the device reports it. */
  accuracy?: number;
  /** Caller address seen by the gateway; checked against APP_OPEN_ALLOWED_NETWORKS when it is set. */
  clientIp?: string;
}

export interface ScanRequest {
  code: string;
  doorId: string;
  actor?: Actor;
}

export interface ManualOpenRequest {
  doorId: string;
  actor: Actor;
  reason?: string;
}

export interface AccessDecision {
  granted: boolean;
  /** Human readable (French) reason when denied. */
  reason?: string;
  door?: { id: string; name: string };
  member?: { id: string; fullName: string; memberCode: string; validUntil: string | null };
  at: string;
  logId?: string;
}

export interface ListLogsRequest {
  limit?: number;
  doorId?: string;
  memberId?: string;
  result?: AccessResult;
  /** ISO date-time cursor: only logs strictly older than this. */
  before?: string;
  /** Adds AccessLogDto.context (position and address of app openings): ADMIN only. */
  includeContext?: boolean;
}

export interface SetCardRequest {
  memberId: string;
  cardNumber: string | null;
}

export interface MemberAccessInfo {
  memberId: string;
  cardNumber: string | null;
  deviceUid: number | null;
  lastVisitAt: string | null;
  visitsThisMonth: number;
  totalVisits: number;
}

export interface LastVisitsRequest {
  memberIds?: string[];
}

export interface LastVisit {
  memberId: string;
  lastVisitAt: string | null;
}

export interface TodayAccessStats {
  checkIns: number;
  uniqueVisitors: number;
  denied: number;
}

export interface CheckinStatsRequest {
  days?: number;
}

export interface CheckinStats {
  daily: { date: string; count: number; unique: number }[];
  hourly: { hour: number; count: number }[];
}

export interface TodayStatsRequest {
  /** YYYY-MM-DD, defaults to today. */
  date?: string;
}

/** Door definition pushed to a door agent (event `doors`). */
export interface AgentDoorConfig {
  id: string;
  name: string;
  driver: DoorDriver;
  config: Record<string, unknown>;
  unlockSeconds: number;
  isActive: boolean;
}

export interface DeviceEventsPayload {
  doorId: string;
  events: { deviceUserId: string; method: 'CARD' | 'FINGERPRINT'; at: string }[];
}

/** Ack of `device.events`. The agent only reads `accepted` and drops the batch once acknowledged. */
export interface DeviceEventsResult {
  /**
   * Punches logged now. A terminal user unknown here is logged without a member; a punch dated more
   * than 5 minutes ahead of the server (terminal clock fast) is logged at the time it is received.
   */
  accepted: number;
  /** Punches already logged (same door, terminal user and terminal time), e.g. resent after a lost ack. */
  duplicates: number;
  /**
   * Not logged (counted in the service log): older than 7 days, malformed punch, door of another
   * agent, or beyond 500 punches in the batch.
   */
  rejected: number;
}

export interface DeviceUserSync {
  deviceUid: number;
  name: string;
  /** Only for members who may enter today; null otherwise, so the badge leaves the terminal. */
  cardNumber: string | null;
  active: boolean;
}
