import { Actor, Paginated, Recipient } from './common.contracts';

export enum MemberStatus {
  ACTIVE = 'ACTIVE',
  SUSPENDED = 'SUSPENDED',
}

export enum Gender {
  MALE = 'MALE',
  FEMALE = 'FEMALE',
}

export enum SubscriptionStatus {
  ACTIVE = 'ACTIVE',
  FROZEN = 'FROZEN',
  EXPIRED = 'EXPIRED',
  CANCELLED = 'CANCELLED',
}

export enum PaymentMethod {
  CASH = 'CASH',
  CARD = 'CARD',
  TRANSFER = 'TRANSFER',
  D17 = 'D17',
}

/** Member.id is the same id as the auth User.id (one identity across services). */
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
  /** ISO instant of the last photo upload, null without photo; clients load `…/photo?v=<Date.parse(it)>`. */
  photoUpdatedAt: string | null;
}

export interface PlanDto {
  id: string;
  name: string;
  description: string | null;
  durationDays: number;
  /** TND */
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
  /** Subscription covering today, if any. */
  current: SubscriptionDto | null;
  /** Next subscription starting after today (renewal paid in advance). */
  upcoming: SubscriptionDto | null;
  /** Whole days until access ends (counting renewals), null when not active. */
  daysLeft: number | null;
  /** Last day covered by the current + chained upcoming subscriptions. */
  validUntil: string | null;
}

export interface MemberListItem extends MemberDto {
  membership: { active: boolean; planName: string | null; endDate: string | null };
}

export interface ListMembersRequest {
  search?: string;
  status?: 'active' | 'expired' | 'suspended' | 'all';
  page?: number;
  pageSize?: number;
}

export interface PaymentInput {
  method: PaymentMethod;
  /** Defaults to the subscription price. */
  amount?: number;
  reference?: string;
}

export interface CreateMemberRequest {
  firstName: string;
  lastName: string;
  email: string;
  phone?: string | null;
  /** When omitted (staff-created member) a temporary password is generated and returned once. */
  password?: string;
  birthDate?: string | null;
  gender?: Gender | null;
  emergencyContact?: string | null;
  notes?: string | null;
  planId?: string;
  payment?: PaymentInput;
  actor?: Actor;
}

export interface CreateMemberResult {
  member: MemberDto;
  subscription: SubscriptionDto | null;
  temporaryPassword: string | null;
}

export interface UpdateMemberRequest {
  id: string;
  data: {
    firstName?: string;
    lastName?: string;
    phone?: string | null;
    birthDate?: string | null;
    gender?: Gender | null;
    emergencyContact?: string | null;
    notes?: string | null;
    status?: MemberStatus;
  };
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

export interface UpdatePlanRequest {
  id: string;
  data: Partial<CreatePlanRequest>;
}

export interface ListPlansRequest {
  includeInactive?: boolean;
}

export interface CreateSubscriptionRequest {
  memberId: string;
  planId: string;
  /** YYYY-MM-DD. Defaults to the day after the member's current access ends, or today. */
  startDate?: string;
  /** Defaults to the plan price (minus the promo code discount). */
  price?: number;
  promoCode?: string;
  payment?: PaymentInput;
  actor?: Actor;
}

export interface UpdateSubscriptionRequest {
  id: string;
  status?: SubscriptionStatus;
  endDate?: string;
}

export interface CreatePaymentRequest {
  memberId: string;
  amount: number;
  method: PaymentMethod;
  reference?: string;
  subscriptionId?: string;
  /** ISO date-time; staff may record a payment received earlier. */
  paidAt?: string;
  actor?: Actor;
}

export interface ListPaymentsRequest {
  from?: string;
  to?: string;
  method?: PaymentMethod;
  memberId?: string;
  page?: number;
  pageSize?: number;
}

export interface PaymentsPage extends Paginated<PaymentDto> {
  sum: number;
}

export interface Entitlement {
  memberId: string;
  memberCode: string;
  firstName: string;
  lastName: string;
  status: MemberStatus;
  windows: { from: string; until: string }[];
}

export interface MembershipSummary {
  totalMembers: number;
  activeMembers: number;
  newThisMonth: number;
  expiringSoon: number;
  revenueThisMonth: number;
  revenueLastMonth: number;
  revenueToday: number;
}

export interface RevenuePoint {
  /** YYYY-MM */
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

export interface BirthdayItem extends Recipient {
  age: number | null;
}

export interface ExpiredItem extends Recipient {
  planName: string;
  endDate: string;
  daysSinceExpiry: number;
}

export interface RecipientsRequest {
  segment?: 'active' | 'expired' | 'all';
}

export interface DailyMembershipReport {
  date: string;
  revenue: number;
  payments: number;
  newMembers: number;
  newSubscriptions: number;
  expiringNext7Days: number;
}

export interface EntitlementsRequest {
  memberIds?: string[];
}

export interface DailyReportRequest {
  /** YYYY-MM-DD, defaults to yesterday. */
  date?: string;
}

export interface ExpiringRequest {
  days?: number;
}

export interface ExpiredRequest {
  days?: number;
}

export interface RevenueRequest {
  months?: number;
}

// ---------- Freeze, promo codes, CRM leads ----------

export interface FreezeSubscriptionRequest {
  id: string;
  /** Number of days to pause; endDate is extended by the same amount on unfreeze. */
  days: number;
  reason?: string | null;
}

export interface UnfreezeSubscriptionRequest {
  id: string;
}

export enum PromoType {
  PERCENT = 'PERCENT',
  FIXED = 'FIXED',
}

export interface PromoCodeDto {
  id: string;
  code: string;
  type: PromoType;
  /** PERCENT: 0-100, FIXED: TND. */
  value: number;
  validFrom: string | null;
  validUntil: string | null;
  maxUses: number | null;
  uses: number;
  isActive: boolean;
  description: string | null;
}

export interface CreatePromoRequest {
  code: string;
  type: PromoType;
  value: number;
  validFrom?: string | null;
  validUntil?: string | null;
  maxUses?: number | null;
  isActive?: boolean;
  description?: string | null;
}

export interface UpdatePromoRequest {
  id: string;
  data: Partial<CreatePromoRequest>;
}

export interface CheckPromoRequest {
  code: string;
  planId: string;
}

export interface PromoQuote {
  code: string;
  planPrice: number;
  discount: number;
  price: number;
}

export enum LeadSource {
  WALK_IN = 'WALK_IN',
  INSTAGRAM = 'INSTAGRAM',
  FACEBOOK = 'FACEBOOK',
  WEBSITE = 'WEBSITE',
  REFERRAL = 'REFERRAL',
  PHONE = 'PHONE',
  OTHER = 'OTHER',
}

export enum LeadStatus {
  NEW = 'NEW',
  CONTACTED = 'CONTACTED',
  TRIAL = 'TRIAL',
  CONVERTED = 'CONVERTED',
  LOST = 'LOST',
}

export enum LeadActivityType {
  CALL = 'CALL',
  MESSAGE = 'MESSAGE',
  EMAIL = 'EMAIL',
  VISIT = 'VISIT',
  NOTE = 'NOTE',
}

export interface LeadActivityDto {
  id: string;
  type: LeadActivityType;
  note: string | null;
  byName: string | null;
  at: string;
}

export interface LeadDto {
  id: string;
  firstName: string;
  lastName: string;
  phone: string | null;
  email: string | null;
  source: LeadSource;
  status: LeadStatus;
  interestPlanId: string | null;
  interestPlanName: string | null;
  /** YYYY-MM-DD of the free trial session, if booked. */
  trialDate: string | null;
  followUpAt: string | null;
  notes: string | null;
  assignedToName: string | null;
  convertedMemberId: string | null;
  createdAt: string;
  activities?: LeadActivityDto[];
}

export interface CreateLeadRequest {
  firstName: string;
  lastName: string;
  phone?: string | null;
  email?: string | null;
  source: LeadSource;
  interestPlanId?: string | null;
  trialDate?: string | null;
  followUpAt?: string | null;
  notes?: string | null;
  assignedToName?: string | null;
}

/** Public website form "Séance d'essai gratuite". */
export interface PublicTrialRequest {
  firstName: string;
  lastName: string;
  phone: string;
  email?: string | null;
  trialDate?: string | null;
  interestPlanId?: string | null;
  message?: string | null;
}

export interface UpdateLeadRequest {
  id: string;
  data: Partial<CreateLeadRequest> & { status?: LeadStatus };
}

export interface ListLeadsRequest {
  status?: LeadStatus;
  source?: LeadSource;
  search?: string;
  /** Only leads whose follow-up date is today or earlier. */
  dueOnly?: boolean;
}

export interface AddLeadActivityRequest {
  leadId: string;
  type: LeadActivityType;
  note?: string | null;
  actor?: Actor;
}

export interface ConvertLeadRequest {
  leadId: string;
  password?: string;
  planId?: string;
  payment?: PaymentInput;
  actor?: Actor;
}

export interface LeadStats {
  newThisMonth: number;
  trialsThisMonth: number;
  convertedThisMonth: number;
  /** converted / (converted + lost) over the last 90 days, 0-1. */
  conversionRate90d: number;
  followUpsDue: number;
}

/** GET /api/dashboard/members-analytics */
export interface MembersAnalytics {
  total: number;
  active: number;
  /** Had a subscription, none covering today. */
  expired: number;
  suspended: number;
  frozen: number;
  /** Members who never subscribed. */
  neverSubscribed: number;
  byGender: { gender: 'MALE' | 'FEMALE' | 'UNKNOWN'; count: number }[];
  byAgeGroup: { label: string; count: number }[];
  /** Last 12 months, oldest first, months without sign-ups included. */
  newPerMonth: { month: string; count: number }[];
  /** Members whose access ended in the last 30 days without renewal. */
  churnedLast30d: number;
  /** Share of subscriptions ended in the last 90 days that were renewed (0-1). */
  renewalRate90d: number;
}

export interface KpiPeriodRequest {
  /** YYYY-MM-DD inclusive, defaults to the first day of the current month. */
  from?: string;
  /** YYYY-MM-DD inclusive, defaults to today. */
  to?: string;
}

/** Membership side of the GMV / NMV / margin KPIs (subscriptions sold in the period). */
export interface MembershipKpis {
  /** Plan list price of subscriptions created in the period (before promo discounts). */
  gross: number;
  discounts: number;
  /** Value of subscriptions created in the period and since cancelled. */
  cancelled: number;
  /** gross − discounts − cancelled */
  net: number;
  /** Payments received in the period (cash view). */
  cashCollected: number;
  /** Active subscriptions today normalised to 30 days. */
  mrr: number;
  activeMembers: number;
  /** net / activeMembers */
  arpu: number;
  monthly: { month: string; gross: number; discounts: number; cancelled: number; net: number; cash: number }[];
}
