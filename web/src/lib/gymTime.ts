/**
 * The gym's own clock (Africa/Tunis), whatever the visitor's device says. The public schedule groups and
 * prints classes with it, so someone browsing from Paris in summer (one hour ahead) still reads the hours
 * the gym planned, on the same days as the back office. Calendar days are `YYYY-MM-DD` strings.
 */
export const GYM_TIME_ZONE = 'Africa/Tunis';

const PARTS = new Intl.DateTimeFormat('en-US', {
  timeZone: GYM_TIME_ZONE,
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
  second: '2-digit',
  hourCycle: 'h23',
});

function wallClock(date: Date) {
  const parts: Record<string, string> = {};
  for (const part of PARTS.formatToParts(date)) parts[part.type] = part.value;
  return { y: +parts.year, m: +parts.month, d: +parts.day, h: +parts.hour % 24, min: +parts.minute, s: +parts.second };
}

const pad = (n: number) => String(n).padStart(2, '0');

/** Calendar day in Tunis: an instant at 23:30 UTC in winter is already the next day there. */
export function gymDay(value: Date | string): string {
  const { y, m, d } = wallClock(new Date(value));
  return `${y}-${pad(m)}-${pad(d)}`;
}

/** "18:30" on the gym's clock, 24 h, Latin digits. */
export function gymClock(value: Date | string): string {
  const { h, min } = wallClock(new Date(value));
  return `${pad(h)}:${pad(min)}`;
}

/** The day `days` calendar days after `day`. */
export function addGymDays(day: string, days: number): string {
  const [y, m, d] = day.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d + days)).toISOString().slice(0, 10);
}

/** How far the gym's clock is ahead of UTC at `instant`, in ms. */
function offsetAt(instant: number): number {
  const { y, m, d, h, min, s } = wallClock(new Date(instant));
  return Date.UTC(y, m - 1, d, h, min, s) - Math.floor(instant / 1000) * 1000;
}

/** The instant the gym's day begins (00:00 in Tunis); the second pass settles DST changes. */
export function gymMidnight(day: string): Date {
  const [y, m, d] = day.split('-').map(Number);
  const wall = Date.UTC(y, m - 1, d);
  const first = wall - offsetAt(wall);
  return new Date(wall - offsetAt(first));
}

/** Noon of a gym day: an instant that is on that day in Tunis, to format its weekday and date. */
export function gymNoon(day: string): Date {
  return new Date(gymMidnight(day).getTime() + 12 * 3_600_000);
}
