import { AccessMethod, DateWindow, DeviceUserSync, fullName, MemberStatus, toDateOnly } from '@app/common';
import { checkMember } from '../access/access-decision';

/**
 * What door agents may send and receive about ZKTeco terminals (security review, finding 11):
 * a punch is logged only at a plausible time (never in the future), and the member list sent to
 * a terminal carries a badge only for members who may enter.
 */

/** Punches older than this are refused: an agent cut off for longer has lost them anyway. */
export const DEVICE_EVENT_MAX_AGE_MS = 7 * 24 * 60 * 60_000;
/**
 * Terminal clocks drift: a punch up to 5 minutes ahead of the server keeps its time; one further
 * ahead (terminal clock fast, wrong timezone) is logged at the time it is received.
 */
export const DEVICE_EVENT_MAX_AHEAD_MS = 5 * 60_000;
export const MAX_DEVICE_EVENTS_PER_BATCH = 500;
/** access_members.deviceUid is a Postgres int. */
const MAX_DEVICE_UID = 2_147_483_647;
/** ZKTeco terminals store at most 24 characters per user name. */
export const DEVICE_NAME_MAX = 24;

export type DeviceEventRejection = 'malformed' | 'too-old' | 'over-limit' | 'foreign-door';

export type ParsedDeviceEvent =
  | {
      ok: true;
      deviceUid: number;
      /** Time reported by the terminal: with the door and user, it identifies a punch sent again. */
      at: Date;
      /** Time the punch is logged at: `at`, or now when the terminal clock is too far ahead. */
      loggedAt: Date;
      method: AccessMethod.CARD | AccessMethod.FINGERPRINT;
    }
  | { ok: false; rejection: 'malformed' | 'too-old' };

/** Checks one punch of a device.events batch, before the member lookup. */
export function parseDeviceEvent(event: unknown, nowMs: number = Date.now()): ParsedDeviceEvent {
  const raw = (typeof event === 'object' && event !== null ? event : {}) as {
    deviceUserId?: unknown;
    method?: unknown;
    at?: unknown;
  };
  const deviceUid =
    typeof raw.deviceUserId === 'number'
      ? raw.deviceUserId
      : typeof raw.deviceUserId === 'string' && /^\d{1,10}$/.test(raw.deviceUserId.trim())
        ? Number(raw.deviceUserId.trim())
        : NaN;
  const at = new Date(typeof raw.at === 'string' || typeof raw.at === 'number' ? raw.at : Number.NaN);
  if (!Number.isInteger(deviceUid) || deviceUid <= 0 || deviceUid > MAX_DEVICE_UID || Number.isNaN(at.getTime())) {
    return { ok: false, rejection: 'malformed' };
  }
  if (at.getTime() < nowMs - DEVICE_EVENT_MAX_AGE_MS) return { ok: false, rejection: 'too-old' };
  // The door did open: a fast terminal clock must not lose the punch, nor date it in the future.
  const loggedAt = at.getTime() > nowMs + DEVICE_EVENT_MAX_AHEAD_MS ? new Date(nowMs) : at;
  return {
    ok: true,
    deviceUid,
    at,
    loggedAt,
    method: raw.method === 'FINGERPRINT' ? AccessMethod.FINGERPRINT : AccessMethod.CARD,
  };
}

/** Same door, same terminal user, same time: the punch was already logged (unique index of access_logs). */
export function deviceEventKey(doorId: string, deviceUid: number, at: Date): string {
  return `${doorId}:${deviceUid}:${at.toISOString()}`;
}

/** "3 too old, 1 malformed" for the service log. */
export function describeRejections(counts: Partial<Record<DeviceEventRejection, number>>): string {
  return Object.entries(counts)
    .filter(([, count]) => (count ?? 0) > 0)
    .map(([rejection, count]) => `${count} ${rejection.replace('-', ' ')}`)
    .join(', ');
}

/**
 * The terminal user of a member. Members who may not enter today, and deleted members, stay in
 * the list as inactive: the agent only acts on the users it is sent, and disables (or deletes)
 * these on the terminal. Their badge number is not sent.
 */
export function toDeviceUser(
  member: {
    deviceUid: number;
    firstName: string;
    lastName: string;
    cardNumber: string | null;
    status: MemberStatus;
    windows: DateWindow[];
    removedAt?: Date | null;
  },
  day: string = toDateOnly(),
): DeviceUserSync {
  const active = !member.removedAt && checkMember(member, day).ok;
  return {
    deviceUid: member.deviceUid,
    name: fullName(member).slice(0, DEVICE_NAME_MAX),
    cardNumber: active ? member.cardNumber : null,
    active,
  };
}
