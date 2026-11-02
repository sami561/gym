export enum BookingStatus {
  BOOKED = 'BOOKED',
  /** Class full: queued, promoted automatically (FIFO) when a place frees up. */
  WAITLISTED = 'WAITLISTED',
  CANCELLED = 'CANCELLED',
  /** Cancelled after the cancellation deadline: counts as a strike. */
  LATE_CANCELLED = 'LATE_CANCELLED',
  ATTENDED = 'ATTENDED',
  /** Booked but never checked in: counts as a strike. */
  NO_SHOW = 'NO_SHOW',
}

/**
 * Reservation policy (env, defaults): BOOKING_OPENS_DAYS=7 (booking opens N days before),
 * BOOKING_CLOSES_MINUTES=0 (closes N minutes before the start), CANCEL_DEADLINE_HOURS=2
 * (later cancellations are LATE_CANCELLED), NO_SHOW_LIMIT=3 strikes in 30 days blocks new
 * bookings for NO_SHOW_BLOCK_DAYS=7, CHECKIN_WINDOW_MINUTES=30 (door check-in that many
 * minutes before the start, until the end, marks the booking ATTENDED).
 */
export interface BookingPolicy {
  opensDays: number;
  closesMinutes: number;
  cancelDeadlineHours: number;
  noShowLimit: number;
  noShowBlockDays: number;
  checkinWindowMinutes: number;
}

export interface ClassSessionDto {
  id: string;
  title: string;
  description: string | null;
  coachId: string | null;
  coachName: string | null;
  room: string | null;
  /** Hex color used in calendars, e.g. "#E10600". */
  color: string | null;
  startsAt: string;
  endsAt: string;
  capacity: number;
  bookedCount: number;
  spotsLeft: number;
  waitlistCount: number;
  waitlistCapacity: number;
  /** Numbered places (e.g. bikes 1..capacity) the member picks when booking. */
  spotSelection: boolean;
  /** Taken spot numbers, only when spotSelection is on. */
  takenSpots: number[];
  bookingOpensAt: string;
  bookingClosesAt: string;
  cancelDeadline: string;
  /** Only set when the request carries a memberId. */
  bookingId?: string | null;
  bookingStatus?: BookingStatus | null;
  spotNumber?: number | null;
  waitlistPosition?: number | null;
}

export interface ListClassesRequest {
  /** ISO date-time; defaults to now. */
  from?: string;
  /** ISO date-time; defaults to from + 7 days. */
  to?: string;
  memberId?: string;
}

export interface CreateClassRequest {
  title: string;
  description?: string | null;
  coachId?: string | null;
  room?: string | null;
  color?: string | null;
  startsAt: string;
  endsAt: string;
  capacity?: number;
  /** Members choose a numbered place (1..capacity). */
  spotSelection?: boolean;
  /** Max members on the waitlist (default 10, 0 disables the waitlist). */
  waitlistCapacity?: number;
  /** Also create the same session on the following N weeks (0-12). */
  repeatWeeks?: number;
}

export interface UpdateClassRequest {
  id: string;
  data: Partial<Omit<CreateClassRequest, 'repeatWeeks'>>;
}

export interface BookingDto {
  id: string;
  sessionId: string;
  memberId: string;
  memberName: string;
  status: BookingStatus;
  spotNumber: number | null;
  /** 1-based position while WAITLISTED. */
  waitlistPosition: number | null;
  checkedInAt: string | null;
  createdAt: string;
  session?: ClassSessionDto;
}

/** Full class → WAITLISTED (if the waitlist has room) instead of an error. */
export interface CreateBookingRequest {
  sessionId: string;
  memberId: string;
  /** Required when the session has spotSelection; must be free. */
  spotNumber?: number;
}

export interface CancelBookingRequest {
  bookingId: string;
  /** Set when a member cancels: the booking must belong to them. */
  memberId?: string;
}

export interface SetBookingStatusRequest {
  bookingId: string;
  status: BookingStatus;
}

export interface MyBookingsRequest {
  memberId: string;
  /** Include past sessions (default: upcoming only). */
  includePast?: boolean;
}

export interface MemberBookingStanding {
  memberId: string;
  strikes30d: number;
  blockedUntil: string | null;
}

export interface ClassStats {
  sessionsToday: number;
  upcomingBookings: number;
  waitlisted: number;
  noShows30d: number;
  /** Average fill rate (0-1) of sessions in the last 30 days. */
  fillRate30d: number;
}

export interface ClassStatsRequest {
  /** YYYY-MM-DD, defaults to today. */
  date?: string;
}
