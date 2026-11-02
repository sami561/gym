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

export interface DoorDto {
  id: string;
  name: string;
  location: string | null;
  driver: DoorDriver;
  /** ZKTECO: { ip, port?, timeoutMs? }; HTTP_RELAY: { url, method?, headers?, body? }; SIMULATOR: {} */
  config: Record<string, unknown>;
  unlockSeconds: number;
  isActive: boolean;
  agentId: string | null;
  agentName: string | null;
  online: boolean;
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
  config?: Record<string, unknown>;
  unlockSeconds?: number;
  isActive?: boolean;
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
}

export interface AccessKey {
  memberCode: string;
  secret: string;
  period: number;
  format: 'MLR1.{memberCode}.{step}.{sig}';
}

export interface OpenByAppRequest {
  memberId: string;
  doorId: string;
  latitude: number;
  longitude: number;
  /** GPS accuracy in meters, if the device reports it. */
  accuracy?: number;
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

export interface DeviceUserSync {
  deviceUid: number;
  name: string;
  cardNumber: string | null;
  active: boolean;
}
