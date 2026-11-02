import { BadRequestException, NotFoundException } from '@nestjs/common';

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
