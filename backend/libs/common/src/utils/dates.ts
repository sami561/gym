/**
 * Calendar helpers. Subscription dates are date-only strings (YYYY-MM-DD, inclusive)
 * interpreted in the gym's timezone (process.env.TZ, Africa/Tunis).
 */
const DAY_MS = 86_400_000;

export function toDateOnly(date: Date = new Date()): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

export function parseDateOnly(value: string): Date {
  const [y, m, d] = value.slice(0, 10).split('-').map(Number);
  return new Date(y, m - 1, d);
}

export function addDays(value: string, days: number): string {
  const date = parseDateOnly(value);
  date.setDate(date.getDate() + days);
  return toDateOnly(date);
}

/** Whole days from `from` to `to` (negative when `to` is earlier). */
export function diffDays(from: string, to: string): number {
  return Math.round((parseDateOnly(to).getTime() - parseDateOnly(from).getTime()) / DAY_MS);
}

export function startOfDay(date: Date = new Date()): Date {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

export function startOfMonth(date: Date = new Date()): Date {
  return new Date(date.getFullYear(), date.getMonth(), 1);
}

export function addMonths(date: Date, months: number): Date {
  return new Date(date.getFullYear(), date.getMonth() + months, 1);
}

export function monthKey(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
}

export interface DateWindow {
  from: string;
  until: string;
}

export function isWithinWindows(windows: DateWindow[], day: string = toDateOnly()): boolean {
  return windows.some((w) => w.from <= day && day <= w.until);
}

/**
 * Last day of uninterrupted access starting at `day`: follows windows that start
 * on or before the day after the current one ends (renewals paid in advance).
 */
export function lastCoveredDay(windows: DateWindow[], day: string = toDateOnly()): string | null {
  const sorted = [...windows].sort((a, b) => a.from.localeCompare(b.from));
  let until: string | null = null;
  for (const w of sorted) {
    if (until === null) {
      if (w.from <= day && day <= w.until) until = w.until;
    } else if (w.from <= addDays(until, 1) && w.until > until) {
      until = w.until;
    }
  }
  return until;
}
