import { BookingDto, BookingEvent, BookingPolicy, ClassSessionDto } from '@app/common';
import { ClassSession } from './classes/class-session.entity';
import { Booking } from './bookings/booking.entity';
import { bookingWindow } from './classes/booking-policy';
import { EMPTY_OCCUPANCY, Occupancy, waitlistPosition } from './classes/occupancy';

/** The member's own booking for a session; pass it only when the request is on behalf of a member. */
export interface MemberView {
  booking: Booking | null;
}

export function toSessionDto(
  session: ClassSession,
  occupancy: Occupancy | undefined,
  policy: BookingPolicy,
  member?: MemberView,
): ClassSessionDto {
  const occ = occupancy ?? EMPTY_OCCUPANCY;
  const window = bookingWindow(session.startsAt, policy);
  const dto: ClassSessionDto = {
    id: session.id,
    title: session.title,
    description: session.description,
    coachId: session.coachId,
    coachName: session.coachName,
    room: session.room,
    color: session.color,
    startsAt: session.startsAt.toISOString(),
    endsAt: session.endsAt.toISOString(),
    capacity: session.capacity,
    bookedCount: occ.booked,
    spotsLeft: Math.max(0, session.capacity - occ.booked),
    waitlistCount: occ.waitlist.length,
    waitlistCapacity: session.waitlistCapacity,
    spotSelection: session.spotSelection,
    takenSpots: session.spotSelection ? occ.takenSpots : [],
    bookingOpensAt: window.opensAt.toISOString(),
    bookingClosesAt: window.closesAt.toISOString(),
    cancelDeadline: window.cancelDeadline.toISOString(),
  };
  if (member) {
    const booking = member.booking;
    const live = booking && ['BOOKED', 'ATTENDED', 'WAITLISTED'].includes(booking.status);
    dto.bookingId = live ? booking.id : null;
    dto.bookingStatus = booking?.status ?? null;
    dto.spotNumber = live ? booking.spotNumber : null;
    dto.waitlistPosition = booking ? waitlistPosition(occ, booking.id) : null;
  }
  return dto;
}

export function toBookingDto(booking: Booking, position: number | null, session?: ClassSessionDto): BookingDto {
  const dto: BookingDto = {
    id: booking.id,
    sessionId: booking.sessionId,
    memberId: booking.memberId,
    memberName: booking.memberName,
    status: booking.status,
    spotNumber: booking.spotNumber,
    waitlistPosition: position,
    checkedInAt: booking.checkedInAt ? booking.checkedInAt.toISOString() : null,
    createdAt: booking.createdAt.toISOString(),
  };
  if (session) dto.session = session;
  return dto;
}

export function toBookingEvent(booking: Booking, session: ClassSession, position: number | null = null): BookingEvent {
  return {
    bookingId: booking.id,
    sessionId: session.id,
    memberId: booking.memberId,
    memberName: booking.memberName,
    email: booking.memberEmail,
    sessionTitle: session.title,
    startsAt: session.startsAt.toISOString(),
    endsAt: session.endsAt.toISOString(),
    coachName: session.coachName,
    room: session.room,
    status: booking.status,
    spotNumber: booking.spotNumber,
    waitlistPosition: position,
  };
}
