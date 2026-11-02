import type { BookingStatus, ClassSessionDto } from '@/api/types';
import type { Tone } from '@/components/StatusPill';

/** What the member can do with a class right now. */
export type ClassAction =
  | { kind: 'mine'; status: BookingStatus }
  | { kind: 'past' }
  | { kind: 'notOpen'; opensAt: string }
  | { kind: 'closed' }
  | { kind: 'blocked' }
  | { kind: 'book' }
  | { kind: 'chooseSpot' }
  | { kind: 'waitlist' }
  | { kind: 'full' };

const ACTIVE_STATUSES: BookingStatus[] = ['BOOKED', 'WAITLISTED', 'ATTENDED', 'NO_SHOW', 'LATE_CANCELLED'];

export function classAction(session: ClassSessionDto, now: number, blocked: boolean): ClassAction {
  const status = session.bookingStatus ?? (session.bookingId ? 'BOOKED' : null);
  if (status && ACTIVE_STATUSES.includes(status)) return { kind: 'mine', status };
  if (new Date(session.endsAt).getTime() < now) return { kind: 'past' };
  if (session.bookingOpensAt && now < new Date(session.bookingOpensAt).getTime()) {
    return { kind: 'notOpen', opensAt: session.bookingOpensAt };
  }
  if (session.bookingClosesAt && now > new Date(session.bookingClosesAt).getTime()) return { kind: 'closed' };
  if (blocked) return { kind: 'blocked' };
  const spotsLeft = session.spotsLeft ?? Math.max(0, session.capacity - session.bookedCount);
  if (spotsLeft > 0) return session.spotSelection ? { kind: 'chooseSpot' } : { kind: 'book' };
  if ((session.waitlistCapacity ?? 0) > (session.waitlistCount ?? 0)) return { kind: 'waitlist' };
  return { kind: 'full' };
}

export const bookingTone: Record<BookingStatus, Tone> = {
  BOOKED: 'success',
  WAITLISTED: 'warning',
  ATTENDED: 'success',
  NO_SHOW: 'danger',
  LATE_CANCELLED: 'danger',
  CANCELLED: 'neutral',
};

/** Booking still holds a place or a waitlist position and can be cancelled. */
export function isCancellable(status: BookingStatus | null | undefined): boolean {
  return status === 'BOOKED' || status === 'WAITLISTED';
}

export function isBlocked(blockedUntil: string | null | undefined, now: number): boolean {
  return !!blockedUntil && new Date(blockedUntil).getTime() > now;
}
