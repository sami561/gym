import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { FALLBACK_GYM } from '../lib/fallbacks';
import { todayHours } from './useLandingData';

const at = (iso: string) => vi.setSystemTime(new Date(iso));

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] });
});

afterEach(() => {
  vi.useRealTimers();
});

describe('todayHours (hero "open today" line)', () => {
  it('shows the week hours from Monday to Saturday', () => {
    at('2026-03-11T09:00:00Z'); // Wednesday
    expect(todayHours(FALLBACK_GYM.openingHours)).toBe('06:00 – 22:00');
    at('2026-03-14T09:00:00Z'); // Saturday
    expect(todayHours(FALLBACK_GYM.openingHours)).toBe('06:00 – 22:00');
  });

  it('shows the Sunday hours on Sunday', () => {
    at('2026-03-15T09:00:00Z');
    expect(todayHours(FALLBACK_GYM.openingHours)).toBe('08:00 – 14:00');
  });

  it('follows the day in Tunis, not in UTC', () => {
    at('2026-03-15T23:30:00Z'); // Sunday in UTC, already Monday 00:30 in Tunis
    expect(todayHours(FALLBACK_GYM.openingHours)).toBe('06:00 – 22:00');
  });

  // Tests run in Tunis (vite.config.ts), where the device day and the gym day are the same: these move the
  // device elsewhere, so code reading the device's day fails here.
  it('follows the day in Tunis on a device in Toronto', () => {
    vi.stubEnv('TZ', 'America/Toronto');
    at('2026-11-07T23:30:00Z'); // Saturday 18:30 in Toronto, Sunday 00:30 in Tunis
    expect(todayHours(FALLBACK_GYM.openingHours)).toBe('08:00 – 14:00');
  });

  it('follows the day in Tunis on a device in Paris in summer', () => {
    vi.stubEnv('TZ', 'Europe/Paris');
    at('2026-06-27T22:30:00Z'); // Sunday 00:30 in Paris, still Saturday 23:30 in Tunis
    expect(todayHours(FALLBACK_GYM.openingHours)).toBe('06:00 – 22:00');
  });

  it('understands English day names from the API', () => {
    at('2026-03-15T09:00:00Z');
    const hours = [
      { days: 'Mon – Sat', open: '06:00', close: '22:00' },
      { days: 'Sunday', open: '09:00', close: '13:00' },
    ];
    expect(todayHours(hours)).toBe('09:00 – 13:00');
  });

  it('shows nothing when the day is not listed', () => {
    at('2026-03-15T09:00:00Z');
    expect(todayHours([{ days: 'Lun – Sam', open: '06:00', close: '22:00' }])).toBeNull();
    expect(todayHours([])).toBeNull();
  });
});
