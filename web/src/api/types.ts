/**
 * Mirror of backend/libs/common/src/contracts/*.ts (the API contract, see docs/API.md).
 * Keep in sync by hand: the web app never imports backend code.
 */

// ---------- common ----------
export interface Paginated<T> {
  items: T[];
  total: number;
  page: number;
  pageSize: number;
}

export interface OkResult {
  ok: true;
}

export interface Recipient {
  memberId: string;
  firstName: string;
  lastName: string;
  email: string;
  phone: string | null;
}

export interface ApiErrorBody {
  statusCode: number;
  message: string | string[];
}

// ---------- gym ----------
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
  facebook: string;
  mapsUrl: string;
  location: { lat: number; lng: number };
  geofenceMeters: number;
  openingHours: OpeningHours[];
}

export interface HealthResponse {
  status: string;
  services: Record<string, 'up' | 'down'>;
}

// ---------- auth ----------
export type Role = 'ADMIN' | 'STAFF' | 'COACH' | 'MEMBER';

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
  expiresIn: number;
  user: UserDto;
}

export interface CreateUserRequest {
  email: string;
  password: string;
  role: Role;
  firstName: string;
  lastName: string;
  phone?: string | null;
  specialty?: string | null;
  bio?: string | null;
  avatarUrl?: string | null;
}

export type UpdateUserData = Partial<Omit<CreateUserRequest, 'password'>> & {
  password?: string;
  isActive?: boolean;
};

export interface PublicCoach {
  id: string;
  firstName: string;
  lastName: string;
  specialty: string | null;
  bio: string | null;
  avatarUrl: string | null;
}

// ---------- membership ----------
export type MemberStatus = 'ACTIVE' | 'SUSPENDED';
export type Gender = 'MALE' | 'FEMALE';
export type SubscriptionStatus = 'ACTIVE' | 'FROZEN' | 'EXPIRED' | 'CANCELLED';
export type PaymentMethod = 'CASH' | 'CARD' | 'TRANSFER' | 'D17';

export interface MemberDto {
  id: string;
  memberCode: string;
  firstName: string;
  lastName: string;
  email: string;
  phone: string | null;
  birthDate: string | null;
  gender: Gender | null;
  emergencyContact: string | null;
  notes: string | null;
  status: MemberStatus;
  joinedAt: string;
  /** ISO instant of the last photo upload, null without photo; load `…/photo?v=<Date.parse(it)>` (docs/API.md, Member photos). */
  photoUpdatedAt: string | null;
}

export interface PlanDto {
  id: string;
  name: string;
  description: string | null;
  durationDays: number;
  price: number;
  features: string[];
  isFeatured: boolean;
  isActive: boolean;
  sortOrder: number;
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

export interface MemberListItem extends MemberDto {
  membership: { active: boolean; planName: string | null; endDate: string | null };
}

export type MemberStatusFilter = 'active' | 'expired' | 'suspended' | 'all';

export interface PaymentInput {
  method: PaymentMethod;
  amount?: number;
  reference?: string;
}

export interface CreateMemberRequest {
  firstName: string;
  lastName: string;
  email: string;
  phone?: string | null;
  password?: string;
  birthDate?: string | null;
  gender?: Gender | null;
  emergencyContact?: string | null;
  notes?: string | null;
  planId?: string;
  payment?: PaymentInput;
}

export interface CreateMemberResult {
  member: MemberDto;
  subscription: SubscriptionDto | null;
  temporaryPassword: string | null;
}

export interface UpdateMemberData {
  firstName?: string;
  lastName?: string;
  phone?: string | null;
  birthDate?: string | null;
  gender?: Gender | null;
  emergencyContact?: string | null;
  notes?: string | null;
  status?: MemberStatus;
}

export interface MemberProfile {
  member: MemberDto;
  membership: MembershipState;
  subscriptions: SubscriptionDto[];
  payments: PaymentDto[];
}

export interface CreatePlanRequest {
  name: string;
  description?: string | null;
  durationDays: number;
  price: number;
  features?: string[];
  isFeatured?: boolean;
  isActive?: boolean;
  sortOrder?: number;
}

export interface CreateSubscriptionBody {
  planId: string;
  startDate?: string;
  price?: number;
  promoCode?: string;
  payment?: PaymentInput;
}

export interface UpdateSubscriptionBody {
  status?: SubscriptionStatus;
  endDate?: string;
}

export interface CreatePaymentBody {
  amount: number;
  method: PaymentMethod;
  reference?: string;
  subscriptionId?: string;
  paidAt?: string;
}

export interface PaymentsPage extends Paginated<PaymentDto> {
  sum: number;
}

export interface RevenuePoint {
  month: string;
  total: number;
  count: number;
}

export interface ExpiringItem extends Recipient {
  memberCode: string;
  planName: string;
  endDate: string;
  daysLeft: number;
}

export interface PlanMixItem {
  planId: string;
  planName: string;
  activeCount: number;
}

// ---------- classes ----------
export type BookingStatus = 'BOOKED' | 'WAITLISTED' | 'CANCELLED' | 'LATE_CANCELLED' | 'ATTENDED' | 'NO_SHOW';

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
  /** Numbered places (bikes 1..capacity) picked when booking. */
  spotSelection: boolean;
  takenSpots: number[];
  bookingOpensAt: string;
  bookingClosesAt: string;
  cancelDeadline: string;
  bookingId?: string | null;
  bookingStatus?: BookingStatus | null;
  spotNumber?: number | null;
  waitlistPosition?: number | null;
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
  spotSelection?: boolean;
  waitlistCapacity?: number;
  repeatWeeks?: number;
}

export type UpdateClassData = Partial<Omit<CreateClassRequest, 'repeatWeeks'>>;

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

// ---------- access ----------
export type DoorDriver = 'ZKTECO' | 'HTTP_RELAY' | 'SIMULATOR';
export type AccessMethod = 'QR' | 'APP' | 'CARD' | 'FINGERPRINT' | 'MANUAL';
export type AccessResult = 'GRANTED' | 'DENIED';

export interface DoorDto {
  id: string;
  name: string;
  location: string | null;
  driver: DoorDriver;
  config: Record<string, unknown>;
  unlockSeconds: number;
  isActive: boolean;
  /** Members may open this door from the app (geofence / gym Wi-Fi rules still apply). */
  allowAppOpen: boolean;
  agentId: string | null;
  agentName: string | null;
  online: boolean;
}

/** Secret config values come back masked; sending the mask back keeps the stored secret. */
export const SECRET_MASK = '********';

export interface AgentDto {
  id: string;
  name: string;
  online: boolean;
  lastSeenAt: string | null;
  doorCount: number;
}

export interface CreateAgentResult {
  agent: AgentDto;
  apiKey: string;
}

export interface CreateDoorRequest {
  name: string;
  location?: string | null;
  driver: DoorDriver;
  config?: Record<string, unknown>;
  unlockSeconds?: number;
  isActive?: boolean;
  allowAppOpen?: boolean;
  agentId?: string | null;
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

export interface AccessDecision {
  granted: boolean;
  reason?: string;
  door?: { id: string; name: string };
  member?: { id: string; fullName: string; memberCode: string; validUntil: string | null };
  at: string;
  logId?: string;
}

export interface MemberAccessInfo {
  memberId: string;
  cardNumber: string | null;
  deviceUid: number | null;
  lastVisitAt: string | null;
  visitsThisMonth: number;
  totalVisits: number;
}

export interface CheckinStats {
  daily: { date: string; count: number; unique: number }[];
  hourly: { hour: number; count: number }[];
}

// ---------- gateway compositions ----------
export interface MemberDetail extends MemberProfile {
  access: MemberAccessInfo;
  visits: AccessLogDto[];
}

export interface DashboardSummary {
  members: { total: number; active: number; newThisMonth: number; expiringSoon: number };
  revenue: { today: number; thisMonth: number; lastMonth: number };
  checkIns: { today: number; uniqueToday: number; deniedToday: number };
  /** waitlisted / noShows30d appear once the gateway forwards the v4 class stats. */
  classes: { today: number; upcomingBookings: number; fillRate30d: number; waitlisted?: number; noShows30d?: number };
}

// ---------- v2 additions used by the web app ----------
export type RoomType =
  | 'MUSCULATION'
  | 'CARDIO'
  | 'COURS_COLLECTIFS'
  | 'CROSSFIT'
  | 'VESTIAIRE'
  | 'ACCUEIL'
  | 'AUTRE';

export interface RoomDto {
  id: string;
  name: string;
  type: RoomType;
  capacity: number;
  floor: string | null;
  description: string | null;
  isActive: boolean;
  equipmentCount: number;
}

export interface PublicTrialRequest {
  firstName: string;
  lastName: string;
  phone: string;
  email?: string | null;
  trialDate?: string | null;
  interestPlanId?: string | null;
  message?: string | null;
}

export interface FreezeSubscriptionBody {
  days: number;
  reason?: string;
}
