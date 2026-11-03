import { BadRequestException, NotFoundException } from '@nestjs/common';
import { formatDayFr, formatTimeFr } from './booking-policy';

export const DAY_MS = 86_400_000;
export const DEFAULT_CAPACITY = 20;
export const MAX_CAPACITY = 500;
export const MAX_REPEAT_WEEKS = 12;
export const MAX_RANGE_DAYS = 120;
export const DEFAULT_WAITLIST_CAPACITY = 10;
export const MAX_WAITLIST_CAPACITY = 200;

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const COLOR_RE = /^#(?:[0-9a-f]{3}|[0-9a-f]{6})$/i;
const DATE_ONLY_RE = /^\d{4}-\d{2}-\d{2}$/;

export function isUuid(value: unknown): value is string {
  return typeof value === 'string' && UUID_RE.test(value);
}

/** Ids are uuids: anything else cannot exist, answer 404 instead of a database error. */
export function assertUuid(value: unknown, notFoundMessage: string): string {
  if (!isUuid(value)) throw new NotFoundException(notFoundMessage);
  return value;
}

export function parseDateTime(value: unknown, label: string): Date {
  const date = typeof value === 'string' || value instanceof Date ? new Date(value) : new Date(NaN);
  if (Number.isNaN(date.getTime())) throw new BadRequestException(`Date invalide : ${label}.`);
  return date;
}

export function assertCapacity(capacity: unknown): number {
  if (typeof capacity !== 'number' || !Number.isInteger(capacity) || capacity < 1 || capacity > MAX_CAPACITY) {
    throw new BadRequestException(`La capacité doit être un entier entre 1 et ${MAX_CAPACITY}.`);
  }
  return capacity;
}

export function assertWaitlistCapacity(value: unknown): number {
  if (typeof value !== 'number' || !Number.isInteger(value) || value < 0 || value > MAX_WAITLIST_CAPACITY) {
    throw new BadRequestException(`La liste d'attente doit être comprise entre 0 et ${MAX_WAITLIST_CAPACITY}.`);
  }
  return value;
}

export function normaliseColor(color: string | null | undefined): string | null {
  if (color === null || color === undefined || color.trim() === '') return null;
  const value = color.trim();
  if (!COLOR_RE.test(value)) throw new BadRequestException('Couleur invalide (format #RRGGBB).');
  return value.toUpperCase();
}

export function assertRepeatWeeks(value: unknown): number {
  const weeks = value ?? 0;
  if (typeof weeks !== 'number' || !Number.isInteger(weeks) || weeks < 0 || weeks > MAX_REPEAT_WEEKS) {
    throw new BadRequestException(`La répétition doit être comprise entre 0 et ${MAX_REPEAT_WEEKS} semaines.`);
  }
  return weeks;
}

/** Same wall-clock time `weeks` weeks later (setDate keeps local time across DST changes). */
export function shiftWeeks(date: Date, weeks: number): Date {
  const shifted = new Date(date.getTime());
  shifted.setDate(shifted.getDate() + weeks * 7);
  return shifted;
}

/** [start, end) of a calendar day in the gym timezone; `date` is YYYY-MM-DD, defaults to today. */
export function dayRange(date?: string): { start: Date; end: Date } {
  let start: Date;
  if (date) {
    if (!DATE_ONLY_RE.test(date)) throw new BadRequestException('Date invalide (format AAAA-MM-JJ).');
    const [y, m, d] = date.split('-').map(Number);
    start = new Date(y, m - 1, d);
    if (start.getFullYear() !== y || start.getMonth() !== m - 1 || start.getDate() !== d) {
      throw new BadRequestException('Date invalide (format AAAA-MM-JJ).');
    }
  } else {
    const now = new Date();
    start = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  }
  const end = new Date(start.getTime());
  end.setDate(end.getDate() + 1);
  return { start, end };
}

/** Average of booked/capacity (each capped at 1), rounded to 3 decimals; 0 without sessions. */
export function averageFillRate(sessions: { id: string; capacity: number }[], booked: Map<string, number>): number {
  if (!sessions.length) return 0;
  const total = sessions.reduce((sum, s) => sum + Math.min(1, (booked.get(s.id) ?? 0) / Math.max(1, s.capacity)), 0);
  return Math.round((total / sessions.length) * 1000) / 1000;
}

/** Same minute: the back-office editor works to the minute, so seconds never count as a change. */
export function sameMinute(a: Date, b: Date): boolean {
  return Math.floor(a.getTime() / 60_000) === Math.floor(b.getTime() / 60_000);
}

export interface TimeSpan {
  startsAt: Date;
  endsAt: Date;
}

/**
 * Moving or resizing a session: never one that already started (only the end of a session in progress
 * may still move, and not into the past), never to a start in the past. Bookings that stay BOOKED after
 * the end become NO_SHOW strikes, so a session must not be pushed back in time.
 */
export function assertReschedule(current: TimeSpan, next: TimeSpan, now: Date = new Date()): void {
  const startMoves = !sameMinute(current.startsAt, next.startsAt);
  const endMoves = !sameMinute(current.endsAt, next.endsAt);
  if (!startMoves && !endMoves) return;
  if (current.startsAt <= now) {
    if (startMoves) throw new BadRequestException('Cette séance a déjà commencé : elle ne peut plus être déplacée.');
    if (current.endsAt <= now) throw new BadRequestException('Cette séance est terminée : ses horaires ne peuvent plus changer.');
    if (next.endsAt <= now) throw new BadRequestException('La fin de la séance ne peut pas être dans le passé.');
    return;
  }
  if (next.startsAt <= now) throw new BadRequestException('Impossible de déplacer une séance dans le passé.');
}

/** What the planning needs to know about a session to detect a double booking. */
export interface ScheduleSlot extends TimeSpan {
  id?: string;
  title: string;
  room: string | null;
  coachId: string | null;
  coachName: string | null;
}

export interface ScheduleConflict {
  kind: 'room' | 'coach';
  other: ScheduleSlot;
}

/** Rooms are free text: compare without case, accents or extra spaces ("Studio " = "studio"). */
export function roomKey(room: string | null | undefined): string {
  return (room ?? '')
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();
}

function overlaps(a: TimeSpan, b: TimeSpan): boolean {
  return a.startsAt < b.endsAt && b.startsAt < a.endsAt;
}

/**
 * First session that overlaps `candidate` in the same room, else with the same coach (back-to-back
 * sessions do not overlap). `others` may contain the candidate itself; it is skipped by id.
 */
export function findScheduleConflict(candidate: ScheduleSlot, others: ScheduleSlot[]): ScheduleConflict | null {
  const clashing = others
    .filter((other) => (candidate.id === undefined || other.id !== candidate.id) && overlaps(candidate, other))
    .sort((a, b) => a.startsAt.getTime() - b.startsAt.getTime());
  const room = roomKey(candidate.room);
  const sameRoom = room ? clashing.find((other) => roomKey(other.room) === room) : undefined;
  if (sameRoom) return { kind: 'room', other: sameRoom };
  const sameCoach = candidate.coachId ? clashing.find((other) => other.coachId === candidate.coachId) : undefined;
  return sameCoach ? { kind: 'coach', other: sameCoach } : null;
}

/** French message for a 409, with the other session's day and hours in the gym timezone. */
export function scheduleConflictMessage({ kind, other }: ScheduleConflict): string {
  const when = `le ${formatDayFr(other.startsAt)} de ${formatTimeFr(other.startsAt)} à ${formatTimeFr(other.endsAt)}`;
  if (kind === 'room') return `La salle « ${(other.room ?? '').trim()} » est déjà prise par « ${other.title} » ${when}.`;
  return `${other.coachName ?? 'Ce coach'} anime déjà « ${other.title} » ${when}.`;
}
