/**
 * Mirror of the backend contracts (backend/libs/common/src/contracts) used by the member app.
 * Keep in sync with docs/API.md.
 */

export type Role = 'ADMIN' | 'STAFF' | 'COACH' | 'MEMBER';
export type MemberStatus = 'ACTIVE' | 'SUSPENDED';
export type Gender = 'MALE' | 'FEMALE';
export type SubscriptionStatus = 'ACTIVE' | 'FROZEN' | 'EXPIRED' | 'CANCELLED';
export type PaymentMethod = 'CASH' | 'CARD' | 'TRANSFER' | 'D17';
export type BookingStatus = 'BOOKED' | 'WAITLISTED' | 'CANCELLED' | 'LATE_CANCELLED' | 'ATTENDED' | 'NO_SHOW';
export type AccessMethod = 'QR' | 'APP' | 'CARD' | 'FINGERPRINT' | 'MANUAL';
export type AccessResult = 'GRANTED' | 'DENIED';
export type PtSessionStatus = 'SCHEDULED' | 'DONE' | 'CANCELLED' | 'NO_SHOW';

export interface UserDto {
  id: string;
  email: string;
  phone: string | null;
  role: Role;
  firstName: string;
  lastName: string;
  avatarUrl: string | null;
  specialty: string | null;
  bio: string | null;
  isActive: boolean;
  createdAt: string;
}

export interface AuthResult {
  accessToken: string;
  refreshToken: string;
  /** Access token lifetime in seconds. */
  expiresIn: number;
  user: UserDto;
}

export interface LoginRequest {
  email: string;
  password: string;
}

export interface RegisterRequest {
  firstName: string;
  lastName: string;
  email: string;
  password: string;
  phone?: string;
  birthDate?: string;
  gender?: Gender;
}

export interface MemberDto {
  id: string;
  memberCode: string;
  firstName: string;
  lastName: string;
  email: string;
  phone: string | null;
  /** YYYY-MM-DD */
  birthDate: string | null;
  gender: Gender | null;
  emergencyContact: string | null;
  notes: string | null;
  status: MemberStatus;
  joinedAt: string;
}

export interface SubscriptionDto {
  id: string;
  memberId: string;
  planId: string;
  plan: { id: string; name: string; durationDays: number };
  startDate: string;
  endDate: string;
  status: SubscriptionStatus;
  price: number;
  createdAt: string;
}

export interface PaymentDto {
  id: string;
  memberId: string;
  memberName: string;
  memberCode: string;
  subscriptionId: string | null;
  planName: string | null;
  amount: number;
  method: PaymentMethod;
  reference: string | null;
  paidAt: string;
  receivedById: string | null;
  receivedByName: string | null;
}

export interface MembershipState {
  active: boolean;
  current: SubscriptionDto | null;
  upcoming: SubscriptionDto | null;
  daysLeft: number | null;
  validUntil: string | null;
}

export interface MemberProfile {
  member: MemberDto;
  membership: MembershipState;
  subscriptions: SubscriptionDto[];
  payments: PaymentDto[];
}

export interface MemberAccessInfo {
  memberId: string;
  cardNumber: string | null;
  deviceUid: number | null;
  lastVisitAt: string | null;
  visitsThisMonth: number;
  totalVisits: number;
}

export interface MeResponse {
  user: UserDto;
  profile: MemberProfile;
  access: MemberAccessInfo;
}

export interface UpdateMeRequest {
  firstName?: string;
  lastName?: string;
  phone?: string | null;
  birthDate?: string | null;
  emergencyContact?: string | null;
}

export interface AccessKey {
  memberCode: string;
  secret: string;
  period: number;
  format: string;
}

export interface MemberDoor {
  id: string;
  name: string;
  location: string | null;
}

export interface OpenDoorRequest {
  latitude: number;
  longitude: number;
  accuracy?: number;
}

export interface AccessDecision {
  granted: boolean;
  reason?: string;
  door?: { id: string; name: string };
  member?: { id: string; fullName: string; memberCode: string; validUntil: string | null };
  at: string;
  logId?: string;
}

export interface AccessLogDto {
  id: string;
  memberId: string | null;
  memberName: string | null;
  memberCode: string | null;
  doorId: string | null;
  doorName: string | null;
  method: AccessMethod;
  result: AccessResult;
  reason: string | null;
  openedById: string | null;
  openedByName: string | null;
  createdAt: string;
}

export interface ClassSessionDto {
  id: string;
  title: string;
  description: string | null;
  coachId: string | null;
  coachName: string | null;
  room: string | null;
  color: string | null;
  startsAt: string;
  endsAt: string;
  capacity: number;
  bookedCount: number;
  spotsLeft: number;
  waitlistCount: number;
  waitlistCapacity: number;
  /** Numbered places (bikes, mats…) picked when booking. */
  spotSelection: boolean;
  /** Taken spot numbers, only when spotSelection is on. */
  takenSpots: number[];
  bookingOpensAt: string;
  bookingClosesAt: string;
  cancelDeadline: string;
  /** Member-specific fields (GET /api/me/classes). */
  bookingId?: string | null;
  bookingStatus?: BookingStatus | null;
  spotNumber?: number | null;
  waitlistPosition?: number | null;
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

export interface CreateBookingRequest {
  sessionId: string;
  /** Required when the session has spotSelection. */
  spotNumber?: number;
}

export interface MemberBookingStanding {
  memberId: string;
  strikes30d: number;
  blockedUntil: string | null;
}

export interface BookingPolicy {
  opensDays: number;
  closesMinutes: number;
  cancelDeadlineHours: number;
  noShowLimit: number;
  noShowBlockDays: number;
  checkinWindowMinutes: number;
}

export interface OpeningHours {
  days: string;
  open: string;
  close: string;
}

export interface GymInfo {
  name: string;
  tagline: string;
  address: string;
  city: string;
  phone: string;
  email: string;
  instagram: string;
  mapsUrl: string;
  location: { lat: number; lng: number };
  geofenceMeters: number;
  openingHours: OpeningHours[];
}

export interface ProgramExercise {
  exerciseId: string | null;
  name: string;
  sets: number;
  reps: string;
  restSeconds: number | null;
  weightKg: number | null;
  notes: string | null;
}

export interface ProgramDay {
  label: string;
  exercises: ProgramExercise[];
}

export interface WorkoutProgramDto {
  id: string;
  memberId: string;
  memberName: string;
  coachId: string | null;
  coachName: string | null;
  title: string;
  goal: string | null;
  startDate: string;
  weeks: number;
  days: ProgramDay[];
  isActive: boolean;
  createdAt: string;
}

export interface MeasurementDto {
  id: string;
  memberId: string;
  date: string;
  weightKg: number | null;
  heightCm: number | null;
  bodyFatPct: number | null;
  musclePct: number | null;
  chestCm: number | null;
  waistCm: number | null;
  hipsCm: number | null;
  armCm: number | null;
  thighCm: number | null;
  bmi: number | null;
  notes: string | null;
  recordedByName: string | null;
}

export interface CreateMeasurementRequest {
  date?: string;
  weightKg?: number | null;
  heightCm?: number | null;
  bodyFatPct?: number | null;
  waistCm?: number | null;
  notes?: string | null;
}

export interface PtSessionDto {
  id: string;
  coachId: string;
  coachName: string;
  memberId: string;
  memberName: string;
  startsAt: string;
  endsAt: string;
  status: PtSessionStatus;
  price: number;
  notes: string | null;
}

export interface OkResult {
  ok: true;
}
