import { BookingDto, BookingEvent, ClassSessionDto } from '@app/common';
import { ClassSession } from './classes/class-session.entity';
import { Booking } from './bookings/booking.entity';

/** `bookingId` is only included when the caller asked on behalf of a member. */
export function toSessionDto(session: ClassSession, bookedCount: number, bookingId?: string | null): ClassSessionDto {
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
    bookedCount,
  };
  if (bookingId !== undefined) dto.bookingId = bookingId;
  return dto;
}

export function toBookingDto(booking: Booking, session?: ClassSessionDto): BookingDto {
  const dto: BookingDto = {
    id: booking.id,
    sessionId: booking.sessionId,
    memberId: booking.memberId,
    memberName: booking.memberName,
    status: booking.status,
    createdAt: booking.createdAt.toISOString(),
  };
  if (session) dto.session = session;
  return dto;
}

export function toBookingEvent(booking: Booking, session: ClassSession): BookingEvent {
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
  };
}
