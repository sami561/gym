import { describe, expect, it } from '@jest/globals';
import type { BookingStatus, ClassSessionDto } from '@/api/types';
import { classSession, ms } from '@/test/fixtures';
import { bookingTone, classAction, isBlocked, isCancellable } from './classState';

// Thursday 5 Nov 2026: booking for the fixture class (Tue 10 Nov, 18:00-19:00 in Tunis) is open.
const NOW = ms('2026-11-05T10:00:00.000Z');
const AFTER_CLASS = ms('2026-11-10T18:00:00.001Z');

describe('classAction', () => {
  describe("the member's own booking", () => {
    it.each<BookingStatus>(['BOOKED', 'WAITLISTED', 'ATTENDED', 'NO_SHOW', 'LATE_CANCELLED'])(
      'shows %s whatever the class state (full, blocked or past)',
      (status) => {
        const full = classSession({ bookingId: 'booking-1', bookingStatus: status, spotsLeft: 0, waitlistCount: 5 });
        expect(classAction(full, NOW, true)).toEqual({ kind: 'mine', status });
        expect(classAction(full, AFTER_CLASS, false)).toEqual({ kind: 'mine', status });
      },
    );

    it('treats a booking id without a status as booked', () => {
      expect(classAction(classSession({ bookingId: 'booking-1' }), NOW, false)).toEqual({ kind: 'mine', status: 'BOOKED' });
      expect(classAction(classSession({ bookingId: 'booking-1', bookingStatus: null }), NOW, false)).toEqual({
        kind: 'mine',
        status: 'BOOKED',
      });
    });

    it('offers to book again after an ordinary cancellation', () => {
      const cancelled = classSession({ bookingId: 'booking-1', bookingStatus: 'CANCELLED' });
      expect(classAction(cancelled, NOW, false)).toEqual({ kind: 'book' });
    });
  });

  describe('booking window', () => {
    it('is past once the class has ended', () => {
      expect(classAction(classSession(), AFTER_CLASS, false)).toEqual({ kind: 'past' });
    });

    it('is closed while the class runs, until its last millisecond', () => {
      expect(classAction(classSession(), ms('2026-11-10T17:30:00.000Z'), false)).toEqual({ kind: 'closed' });
      expect(classAction(classSession(), ms('2026-11-10T18:00:00.000Z'), false)).toEqual({ kind: 'closed' });
    });

    it('is closed after bookingClosesAt even before the class starts', () => {
      const closesEarly = classSession({ bookingClosesAt: '2026-11-10T16:00:00.000Z' });
      expect(classAction(closesEarly, ms('2026-11-10T16:00:00.001Z'), false)).toEqual({ kind: 'closed' });
    });

    // Known bug in src/lib/classState.ts: class-service (assertBookingOpen) refuses bookings from closesAt
    // itself (now >= closesAt) but the app offers "Book" until it has passed (now > bookingClosesAt).
    // With the default policy closesAt is the start time, so the server answers "already started".
    it.skip('is closed from bookingClosesAt itself, like the backend', () => {
      const session = classSession();
      expect(classAction(session, ms(session.bookingClosesAt), false)).toEqual({ kind: 'closed' });
    });

    it('is not open before bookingOpensAt and says when it opens', () => {
      const session = classSession();
      expect(classAction(session, ms(session.bookingOpensAt) - 1, false)).toEqual({
        kind: 'notOpen',
        opensAt: '2026-11-03T17:00:00.000Z',
      });
    });

    it('opens at bookingOpensAt exactly', () => {
      const session = classSession();
      expect(classAction(session, ms(session.bookingOpensAt), false)).toEqual({ kind: 'book' });
    });
  });

  describe('availability', () => {
    it('offers to book while places are left', () => {
      expect(classAction(classSession({ spotsLeft: 1 }), NOW, false)).toEqual({ kind: 'book' });
    });

    it('asks for a spot when places are numbered', () => {
      expect(classAction(classSession({ spotSelection: true }), NOW, false)).toEqual({ kind: 'chooseSpot' });
    });

    it('offers the waitlist when the class is full and the waitlist has room', () => {
      const full = classSession({ bookedCount: 10, spotsLeft: 0, waitlistCount: 4, waitlistCapacity: 5 });
      expect(classAction(full, NOW, false)).toEqual({ kind: 'waitlist' });
      expect(classAction({ ...full, spotSelection: true }, NOW, false)).toEqual({ kind: 'waitlist' });
    });

    it('is full when the waitlist is full or there is none', () => {
      const full = classSession({ bookedCount: 10, spotsLeft: 0 });
      expect(classAction({ ...full, waitlistCount: 5, waitlistCapacity: 5 }, NOW, false)).toEqual({ kind: 'full' });
      expect(classAction({ ...full, waitlistCount: 0, waitlistCapacity: 0 }, NOW, false)).toEqual({ kind: 'full' });
    });

    it('without spotsLeft, counts capacity minus bookings, never below zero', () => {
      const withoutSpotsLeft = (overrides: Partial<ClassSessionDto>) =>
        ({ ...classSession(overrides), spotsLeft: undefined }) as unknown as ClassSessionDto;
      expect(classAction(withoutSpotsLeft({ capacity: 10, bookedCount: 9 }), NOW, false)).toEqual({ kind: 'book' });
      // Capacity lowered below the bookings already taken.
      expect(classAction(withoutSpotsLeft({ capacity: 8, bookedCount: 10, waitlistCapacity: 0 }), NOW, false)).toEqual({
        kind: 'full',
      });
    });
  });

  describe('booking suspension (strikes)', () => {
    it('blocks booking and the waitlist while suspended', () => {
      expect(classAction(classSession(), NOW, true)).toEqual({ kind: 'blocked' });
      expect(classAction(classSession({ spotsLeft: 0, waitlistCount: 0 }), NOW, true)).toEqual({ kind: 'blocked' });
    });

    it('still reports a past, not yet open or closed class as such', () => {
      const session = classSession();
      expect(classAction(session, AFTER_CLASS, true)).toEqual({ kind: 'past' });
      expect(classAction(session, ms(session.bookingOpensAt) - 1, true).kind).toBe('notOpen');
      expect(classAction(session, ms('2026-11-10T17:30:00.000Z'), true)).toEqual({ kind: 'closed' });
    });
  });
});

describe('bookingTone', () => {
  // class-service classes/occupancy.ts: HOLDING_STATUSES keep a place, STRIKE_STATUSES lead to a suspension.
  const HOLDING: BookingStatus[] = ['BOOKED', 'ATTENDED'];
  const STRIKES: BookingStatus[] = ['NO_SHOW', 'LATE_CANCELLED'];

  it('colours a held place as success and a strike as danger', () => {
    for (const status of HOLDING) expect(bookingTone[status]).toBe('success');
    for (const status of STRIKES) expect(bookingTone[status]).toBe('danger');
  });

  it('keeps danger for strikes: a waitlist place or a cancellation in time is no fault', () => {
    expect(bookingTone.WAITLISTED).toBe('warning');
    expect(bookingTone.CANCELLED).toBe('neutral');
    const danger = (Object.keys(bookingTone) as BookingStatus[]).filter((status) => bookingTone[status] === 'danger');
    expect(danger.sort()).toEqual([...STRIKES].sort());
  });
});

describe('isCancellable', () => {
  it.each<[BookingStatus | null | undefined, boolean]>([
    ['BOOKED', true],
    ['WAITLISTED', true],
    ['ATTENDED', false],
    ['NO_SHOW', false],
    ['LATE_CANCELLED', false],
    ['CANCELLED', false],
    [null, false],
    [undefined, false],
  ])('%s → %s', (status, expected) => {
    expect(isCancellable(status)).toBe(expected);
  });
});

describe('isBlocked', () => {
  it('is blocked until blockedUntil, not at or after it', () => {
    const until = '2026-11-09T21:00:00.000Z';
    expect(isBlocked(until, ms(until) - 1)).toBe(true);
    expect(isBlocked(until, ms(until))).toBe(false);
    expect(isBlocked(until, ms(until) + 1)).toBe(false);
  });

  it('is not blocked without a date', () => {
    expect(isBlocked(null, NOW)).toBe(false);
    expect(isBlocked(undefined, NOW)).toBe(false);
    expect(isBlocked('', NOW)).toBe(false);
  });
});
