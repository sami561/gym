import { BadRequestException } from '@nestjs/common';
import { addMonths, monthKey, parseDateOnly, startOfMonth } from '@app/common';

/** Timezone used for cron jobs and SQL month/day grouping. */
export const GYM_TIMEZONE = 'Africa/Tunis';

export function gymTimezone(): string {
  return process.env.TZ || GYM_TIMEZONE;
}

const DATE_ONLY = /^\d{4}-\d{2}-\d{2}$/;

function parseInstant(value: string, label: string): Date {
  const date = DATE_ONLY.test(value) ? parseDateOnly(value) : new Date(value);
  if (Number.isNaN(date.getTime())) throw new BadRequestException(`Date invalide pour « ${label} ».`);
  return date;
}

/** Lower bound: YYYY-MM-DD means the start of that local day, otherwise an ISO date-time. */
export function parseFrom(value?: string | null): Date | undefined {
  return value ? parseInstant(value, 'du') : undefined;
}

/** Upper bound (exclusive): YYYY-MM-DD includes that whole local day. */
export function parseToExclusive(value?: string | null): Date | undefined {
  if (!value) return undefined;
  const date = parseInstant(value, 'au');
  if (DATE_ONLY.test(value)) date.setDate(date.getDate() + 1);
  return date;
}

/** YYYY-MM-DD for date-only columns (accepts ISO date-times and keeps their date part). */
export function toDateBound(value?: string | null): string | undefined {
  if (!value) return undefined;
  const day = value.slice(0, 10);
  if (!DATE_ONLY.test(day) || Number.isNaN(parseDateOnly(day).getTime())) {
    throw new BadRequestException(`Date invalide : ${value}.`);
  }
  return day;
}

export function assertDateOnly(value: unknown, label: string): string {
  if (typeof value !== 'string' || !DATE_ONLY.test(value) || Number.isNaN(parseDateOnly(value).getTime())) {
    throw new BadRequestException(`${label} doit être une date au format AAAA-MM-JJ.`);
  }
  return value;
}

/** Month keys (YYYY-MM) of the last `months` months, oldest first, current month last. */
export function monthKeysBack(months: number, now: Date = new Date()): string[] {
  const first = addMonths(startOfMonth(now), -(months - 1));
  return Array.from({ length: months }, (_, index) => monthKey(addMonths(first, index)));
}

export function clampInt(value: unknown, fallback: number, min: number, max: number): number {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.min(max, Math.max(min, Math.trunc(parsed)));
}

export function likePattern(search: string): string {
  return `%${search.trim().replace(/[\\%_]/g, (match) => `\\${match}`)}%`;
}
