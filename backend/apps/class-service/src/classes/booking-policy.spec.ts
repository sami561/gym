import { BadRequestException } from '@nestjs/common';
import { BookingPolicy } from '@app/common';
import {
  assertBookingOpen,
  bookingWindow,
  computeStanding,
  formatDateTimeFr,
  loadBookingPolicy,
  standingLookbackStart,
} from './booking-policy';

const DAY = 86_400_000;
const policy: BookingPolicy = {
  opensDays: 7,
  closesMinutes: 0,
  cancelDeadlineHours: 2,
  noShowLimit: 3,
  noShowBlockDays: 7,
  checkinWindowMinutes: 30,
};

describe('booking policy', () => {
  const keys = [
    'BOOKING_OPENS_DAYS',
    'BOOKING_CLOSES_MINUTES',
    'CANCEL_DEADLINE_HOURS',
    'NO_SHOW_LIMIT',
    'NO_SHOW_BLOCK_DAYS',
    'CHECKIN_WINDOW_MINUTES',
  ];
  const saved = Object.fromEntries(keys.map((k) => [k, process.env[k]]));
  afterEach(() => keys.forEach((k) => (saved[k] === undefined ? delete process.env[k] : (process.env[k] = saved[k]))));

  it('uses the documented defaults', () => {
    keys.forEach((k) => delete process.env[k]);
    expect(loadBookingPolicy()).toEqual(policy);
  });

  it('reads overrides from env and ignores negative values', () => {
    process.env.BOOKING_OPENS_DAYS = '14';
    process.env.CANCEL_DEADLINE_HOURS = '12';
    process.env.NO_SHOW_LIMIT = '-1';
    expect(loadBookingPolicy()).toMatchObject({ opensDays: 14, cancelDeadlineHours: 12, noShowLimit: 3 });
  });

  it('derives the booking window and cancellation deadline from the start', () => {
    const start = new Date('2026-11-10T17:00:00.000Z');
    const window = bookingWindow(start, { ...policy, closesMinutes: 30 });
    expect(window.opensAt.toISOString()).toBe('2026-11-03T17:00:00.000Z');
    expect(window.closesAt.toISOString()).toBe('2026-11-10T16:30:00.000Z');
    expect(window.cancelDeadline.toISOString()).toBe('2026-11-10T15:00:00.000Z');
  });

  it('refuses bookings before the window opens, after it closes, or once started', () => {
    const start = new Date('2026-11-10T17:00:00.000Z');
    expect(() => assertBookingOpen(start, policy, new Date('2026-11-02T12:00:00.000Z'))).toThrow(
      'Les réservations ouvrent le 03/11/2026 à 18:00.',
    );
    expect(() => assertBookingOpen(start, policy, new Date('2026-11-05T12:00:00.000Z'))).not.toThrow();
    expect(() =>
      assertBookingOpen(start, { ...policy, closesMinutes: 60 }, new Date('2026-11-10T16:30:00.000Z')),
    ).toThrow('Les réservations sont fermées pour cette séance.');
    expect(() => assertBookingOpen(start, policy, new Date('2026-11-10T17:00:00.000Z'))).toThrow(BadRequestException);
  });

  it('formats dates in the gym timezone (Tunis, UTC+1)', () => {
    expect(formatDateTimeFr(new Date('2026-11-03T17:05:00.000Z'))).toBe('03/11/2026 à 18:05');
  });

  describe('strikes', () => {
    const now = new Date('2026-11-20T12:00:00.000Z');
    const daysAgo = (n: number) => new Date(now.getTime() - n * DAY);

    it('counts strikes of the last 30 days without blocking below the limit', () => {
      expect(computeStanding([daysAgo(1), daysAgo(5), daysAgo(40)], policy, now)).toEqual({
        strikes30d: 2,
        blockedUntil: null,
      });
    });

    it('blocks for 7 days from the strike that reaches the limit', () => {
      const standing = computeStanding([daysAgo(10), daysAgo(4), daysAgo(2)], policy, now);
      expect(standing.strikes30d).toBe(3);
      expect(standing.blockedUntil?.getTime()).toBe(daysAgo(2).getTime() + 7 * DAY);
    });

    it('lifts the block after it expires even with 3 strikes still in the window', () => {
      expect(computeStanding([daysAgo(20), daysAgo(15), daysAgo(9)], policy, now)).toEqual({
        strikes30d: 3,
        blockedUntil: null,
      });
    });

    it('only counts strikes within 30 days of each other', () => {
      // 35 days between the first and the last strike: never 3 within 30 days.
      expect(computeStanding([daysAgo(36), daysAgo(3), daysAgo(1)], policy, now).blockedUntil).toBeNull();
    });

    it('a new strike while over the limit blocks again', () => {
      const standing = computeStanding([daysAgo(25), daysAgo(24), daysAgo(23), daysAgo(1)], policy, now);
      expect(standing.blockedUntil?.getTime()).toBe(daysAgo(1).getTime() + 7 * DAY);
    });

    it('a limit of 0 disables blocking', () => {
      expect(computeStanding([daysAgo(1), daysAgo(1), daysAgo(1)], { ...policy, noShowLimit: 0 }, now).blockedUntil).toBeNull();
    });

    it('looks back far enough to see every strike that can still block', () => {
      expect(standingLookbackStart(policy, now).getTime()).toBe(daysAgo(37).getTime());
    });
  });
});
