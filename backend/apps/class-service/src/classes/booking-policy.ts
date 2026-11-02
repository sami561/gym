import { BadRequestException } from '@nestjs/common';
import { BookingPolicy, envInt } from '@app/common';

const DAY_MS = 86_400_000;
export const STRIKE_WINDOW_DAYS = 30;
/** booking.reminder goes out this long before the class. */
export const REMINDER_MINUTES = 120;
/** BOOKED bookings become NO_SHOW this long after the end of the class. */
export const NO_SHOW_GRACE_MINUTES = 15;

/** Reservation policy from env (documented defaults); negative values fall back to the default. */
export function loadBookingPolicy(): BookingPolicy {
  return {
    opensDays: nonNegative('BOOKING_OPENS_DAYS', 7),
    closesMinutes: nonNegative('BOOKING_CLOSES_MINUTES', 0),
    cancelDeadlineHours: nonNegative('CANCEL_DEADLINE_HOURS', 2),
    noShowLimit: nonNegative('NO_SHOW_LIMIT', 3),
    noShowBlockDays: nonNegative('NO_SHOW_BLOCK_DAYS', 7),
    checkinWindowMinutes: nonNegative('CHECKIN_WINDOW_MINUTES', 30),
  };
}

function nonNegative(name: string, fallback: number): number {
  const value = envInt(name, fallback);
  return value >= 0 ? value : fallback;
}

export interface BookingWindow {
  opensAt: Date;
  closesAt: Date;
  cancelDeadline: Date;
}

/** opensAt = start − opensDays (same wall-clock time), closesAt = start − closesMinutes. */
export function bookingWindow(startsAt: Date, policy: BookingPolicy): BookingWindow {
  const opensAt = new Date(startsAt.getTime());
  opensAt.setDate(opensAt.getDate() - policy.opensDays);
  return {
    opensAt,
    closesAt: new Date(startsAt.getTime() - policy.closesMinutes * 60_000),
    cancelDeadline: new Date(startsAt.getTime() - policy.cancelDeadlineHours * 3_600_000),
  };
}

export function assertBookingOpen(startsAt: Date, policy: BookingPolicy, now: Date = new Date()): void {
  if (now >= startsAt) throw new BadRequestException('Cette séance a déjà commencé.');
  const window = bookingWindow(startsAt, policy);
  if (now < window.opensAt) {
    throw new BadRequestException(`Les réservations ouvrent le ${formatDateTimeFr(window.opensAt)}.`);
  }
  if (now >= window.closesAt) throw new BadRequestException('Les réservations sont fermées pour cette séance.');
}

export interface Standing {
  strikes30d: number;
  blockedUntil: Date | null;
}

/**
 * Each strike (no-show / late cancellation) that brings the member to `noShowLimit` strikes within
 * the 30 days before it blocks new bookings for `noShowBlockDays` from that strike. A limit of 0
 * disables blocking. `blockedUntil` is only returned while the block is still running.
 */
export function computeStanding(strikes: Date[], policy: BookingPolicy, now: Date = new Date()): Standing {
  const windowMs = STRIKE_WINDOW_DAYS * DAY_MS;
  const times = strikes
    .map((d) => d.getTime())
    .filter((t) => Number.isFinite(t) && t <= now.getTime())
    .sort((a, b) => a - b);
  const strikes30d = times.filter((t) => t > now.getTime() - windowMs).length;
  if (policy.noShowLimit <= 0) return { strikes30d, blockedUntil: null };

  let blockedUntil: Date | null = null;
  for (const t of times) {
    const inWindow = times.filter((u) => u > t - windowMs && u <= t).length;
    if (inWindow < policy.noShowLimit) continue;
    const until = new Date(t);
    until.setDate(until.getDate() + policy.noShowBlockDays);
    if (!blockedUntil || until > blockedUntil) blockedUntil = until;
  }
  return { strikes30d, blockedUntil: blockedUntil && blockedUntil > now ? blockedUntil : null };
}

/** Strikes older than this cannot influence the current standing. */
export function standingLookbackStart(policy: BookingPolicy, now: Date = new Date()): Date {
  return new Date(now.getTime() - (STRIKE_WINDOW_DAYS + policy.noShowBlockDays) * DAY_MS);
}

function gymTimeZone(): string {
  return process.env.TZ || 'Africa/Tunis';
}

function format(date: Date, options: Intl.DateTimeFormatOptions): string {
  try {
    return new Intl.DateTimeFormat('fr-FR', { ...options, timeZone: gymTimeZone() }).format(date);
  } catch {
    return new Intl.DateTimeFormat('fr-FR', { ...options, timeZone: 'Africa/Tunis' }).format(date);
  }
}

/** "10/11/2026 à 18:00" in the gym timezone. */
export function formatDateTimeFr(date: Date): string {
  const day = format(date, { day: '2-digit', month: '2-digit', year: 'numeric' });
  const time = format(date, { hour: '2-digit', minute: '2-digit', hour12: false });
  return `${day} à ${time}`;
}
