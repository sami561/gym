import { BadRequestException } from '@nestjs/common';
import { BookingStatus } from '@app/common';
import { assertStaffStatus, assertStatusTiming } from './status-rules';

const { BOOKED, WAITLISTED, CANCELLED, LATE_CANCELLED, ATTENDED, NO_SHOW } = BookingStatus;
const start = new Date('2026-11-10T17:00:00.000Z');
const before = new Date('2026-11-10T16:59:00.000Z');
const after = new Date('2026-11-10T18:30:00.000Z');

describe('staff booking status rules', () => {
  it('accepts the statuses staff set by hand', () => {
    for (const status of [BOOKED, CANCELLED, ATTENDED, NO_SHOW]) expect(assertStaffStatus(status)).toBe(status);
  });

  it('refuses the waitlist and late cancellations, which only the booking flow sets', () => {
    expect(() => assertStaffStatus(WAITLISTED)).toThrow("La liste d'attente est gérée automatiquement par les réservations.");
    expect(() => assertStaffStatus(LATE_CANCELLED)).toThrow(BadRequestException);
  });

  it('refuses unknown values', () => {
    expect(() => assertStaffStatus('PAID')).toThrow('Statut invalide.');
    expect(() => assertStaffStatus(undefined)).toThrow(BadRequestException);
  });

  it('marks a member absent only once the class has started', () => {
    expect(() => assertStatusTiming(NO_SHOW, start, before)).toThrow('Impossible de marquer absent avant le début du cours.');
    expect(() => assertStatusTiming(NO_SHOW, start, before)).toThrow(BadRequestException);
    expect(() => assertStatusTiming(NO_SHOW, start, start)).not.toThrow();
    expect(() => assertStatusTiming(NO_SHOW, start, after)).not.toThrow();
  });

  it('lets staff check in, book or cancel before the start', () => {
    for (const status of [ATTENDED, BOOKED, CANCELLED]) expect(() => assertStatusTiming(status, start, before)).not.toThrow();
  });
});
