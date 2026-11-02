import { BookingPolicy, BookingStatus } from '@app/common';
import { Booking } from './bookings/booking.entity';
import { ClassSession } from './classes/class-session.entity';
import { Occupancy } from './classes/occupancy';
import { toBookingDto, toBookingEvent, toSessionDto } from './mappers';

const policy: BookingPolicy = { opensDays: 7, closesMinutes: 30, cancelDeadlineHours: 2, noShowLimit: 3, noShowBlockDays: 7, checkinWindowMinutes: 30 };

const session = (overrides: Partial<ClassSession> = {}): ClassSession =>
  Object.assign(new ClassSession(), {
    id: 's-1',
    title: 'Body Pump',
    description: null,
    coachId: 'u-coach',
    coachName: 'Karim Jaziri',
    room: 'Salle cours collectifs',
    color: '#E11D48',
    startsAt: new Date('2026-11-10T17:00:00.000Z'), // 18:00 in Tunis
    endsAt: new Date('2026-11-10T18:00:00.000Z'),
    capacity: 20,
    spotSelection: false,
    waitlistCapacity: 10,
    ...overrides,
  });

const booking = (id: string, status: BookingStatus, overrides: Partial<Booking> = {}): Booking =>
  Object.assign(new Booking(), {
    id,
    sessionId: 's-1',
    memberId: 'm-1',
    memberName: 'Amira Ben Salah',
    memberEmail: 'amira@example.com',
    status,
    spotNumber: null,
    queuedAt: null,
    checkedInAt: null,
    reminderSentAt: null,
    strikeAt: null,
    createdAt: new Date('2026-11-03T08:00:00.000Z'),
    ...overrides,
  });

const occupancy = (booked: number, takenSpots: number[] = [], waitlist: Booking[] = []): Occupancy<Booking> => ({ booked, takenSpots, waitlist });

describe('class mappers', () => {
  describe('toSessionDto', () => {
    it('shows places, waitlist and the booking window of the session', () => {
      expect(toSessionDto(session(), occupancy(18, [], [booking('w-1', BookingStatus.WAITLISTED)]), policy)).toEqual({
        id: 's-1',
        title: 'Body Pump',
        description: null,
        coachId: 'u-coach',
        coachName: 'Karim Jaziri',
        room: 'Salle cours collectifs',
        color: '#E11D48',
        startsAt: '2026-11-10T17:00:00.000Z',
        endsAt: '2026-11-10T18:00:00.000Z',
        capacity: 20,
        bookedCount: 18,
        spotsLeft: 2,
        waitlistCount: 1,
        waitlistCapacity: 10,
        spotSelection: false,
        takenSpots: [],
        bookingOpensAt: '2026-11-03T17:00:00.000Z',
        bookingClosesAt: '2026-11-10T16:30:00.000Z',
        cancelDeadline: '2026-11-10T15:00:00.000Z',
      });
    });

    it('treats a session without bookings as empty and never shows negative places', () => {
      expect(toSessionDto(session(), undefined, policy)).toMatchObject({ bookedCount: 0, spotsLeft: 20, waitlistCount: 0 });
      expect(toSessionDto(session({ capacity: 10 }), occupancy(12), policy).spotsLeft).toBe(0);
    });

    it('lists taken spots only with spot selection', () => {
      expect(toSessionDto(session(), occupancy(2, [3, 7]), policy).takenSpots).toEqual([]);
      expect(toSessionDto(session({ spotSelection: true }), occupancy(2, [3, 7]), policy).takenSpots).toEqual([3, 7]);
    });

    it('adds the member view only when asked', () => {
      expect(toSessionDto(session(), occupancy(1), policy)).not.toHaveProperty('bookingId');
      expect(toSessionDto(session(), occupancy(1), policy, { booking: null })).toMatchObject({
        bookingId: null,
        bookingStatus: null,
        spotNumber: null,
        waitlistPosition: null,
      });
    });

    it('shows a live booking with its spot, a cancelled one by status only', () => {
      const booked = booking('b-1', BookingStatus.BOOKED, { spotNumber: 4 });
      expect(toSessionDto(session({ spotSelection: true }), occupancy(1, [4]), policy, { booking: booked })).toMatchObject({
        bookingId: 'b-1',
        bookingStatus: BookingStatus.BOOKED,
        spotNumber: 4,
      });
      const cancelled = booking('b-1', BookingStatus.LATE_CANCELLED, { spotNumber: 4 });
      expect(toSessionDto(session(), occupancy(0), policy, { booking: cancelled })).toMatchObject({
        bookingId: null,
        bookingStatus: BookingStatus.LATE_CANCELLED,
        spotNumber: null,
      });
    });

    it('gives a waitlisted member their position', () => {
      const queue = [booking('w-1', BookingStatus.WAITLISTED), booking('w-2', BookingStatus.WAITLISTED, { memberId: 'm-2' })];
      expect(toSessionDto(session(), occupancy(20, [], queue), policy, { booking: queue[1] })).toMatchObject({
        bookingId: 'w-2',
        bookingStatus: BookingStatus.WAITLISTED,
        waitlistPosition: 2,
      });
    });
  });

  it('maps a booking, with the session only when given', () => {
    const attended = booking('b-1', BookingStatus.ATTENDED, { checkedInAt: new Date('2026-11-10T16:55:00.000Z') });
    expect(toBookingDto(attended, null)).toEqual({
      id: 'b-1',
      sessionId: 's-1',
      memberId: 'm-1',
      memberName: 'Amira Ben Salah',
      status: BookingStatus.ATTENDED,
      spotNumber: null,
      waitlistPosition: null,
      checkedInAt: '2026-11-10T16:55:00.000Z',
      createdAt: '2026-11-03T08:00:00.000Z',
    });
    const sessionDto = toSessionDto(session(), undefined, policy);
    expect(toBookingDto(booking('b-2', BookingStatus.BOOKED), null, sessionDto).session).toBe(sessionDto);
  });

  it('builds the notification event with the e-mail and the class details', () => {
    expect(toBookingEvent(booking('b-1', BookingStatus.WAITLISTED), session(), 3)).toEqual({
      bookingId: 'b-1',
      sessionId: 's-1',
      memberId: 'm-1',
      memberName: 'Amira Ben Salah',
      email: 'amira@example.com',
      sessionTitle: 'Body Pump',
      startsAt: '2026-11-10T17:00:00.000Z',
      endsAt: '2026-11-10T18:00:00.000Z',
      coachName: 'Karim Jaziri',
      room: 'Salle cours collectifs',
      status: BookingStatus.WAITLISTED,
      spotNumber: null,
      waitlistPosition: 3,
    });
    expect(toBookingEvent(booking('b-1', BookingStatus.BOOKED), session()).waitlistPosition).toBeNull();
  });
});
