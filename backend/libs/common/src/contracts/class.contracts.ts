export enum BookingStatus {
  BOOKED = 'BOOKED',
  CANCELLED = 'CANCELLED',
  ATTENDED = 'ATTENDED',
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
  /** Only set when the request carries a memberId. */
  bookingId?: string | null;
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
  createdAt: string;
  session?: ClassSessionDto;
}

export interface CreateBookingRequest {
  sessionId: string;
  memberId: string;
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

export interface ClassStats {
  sessionsToday: number;
  upcomingBookings: number;
  /** Average fill rate (0-1) of sessions in the last 30 days. */
  fillRate30d: number;
}

export interface ClassStatsRequest {
  /** YYYY-MM-DD, defaults to today. */
  date?: string;
}
