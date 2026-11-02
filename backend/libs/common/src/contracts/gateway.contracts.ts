import { UserDto } from './auth.contracts';
import { MemberProfile } from './membership.contracts';
import { AccessLogDto, MemberAccessInfo } from './access.contracts';

/** GET /api/me */
export interface MeResponse {
  user: UserDto;
  profile: MemberProfile;
  access: MemberAccessInfo;
}

/** GET /api/members/:id */
export interface MemberDetail extends MemberProfile {
  access: MemberAccessInfo;
  visits: AccessLogDto[];
}

/** GET /api/dashboard/summary */
export interface DashboardSummary {
  members: { total: number; active: number; newThisMonth: number; expiringSoon: number };
  revenue: { today: number; thisMonth: number; lastMonth: number };
  checkIns: { today: number; uniqueToday: number; deniedToday: number };
  classes: { today: number; upcomingBookings: number; fillRate30d: number };
}

/** GET /api/dashboard/operations — the back-office modules at a glance. */
export interface OperationsSummary {
  staff: import('./staff.contracts').StaffStats | null;
  facility: import('./facility.contracts').FacilityStats | null;
  commerce: import('./commerce.contracts').CommerceStats | null;
  training: import('./training.contracts').TrainingStats | null;
  leads: import('./membership.contracts').LeadStats | null;
  workflows: import('./workflow.contracts').WorkflowStats | null;
}

/** GET /api/dashboard/team?date=YYYY-MM-DD — who works when. */
export interface TeamOverview {
  date: string;
  employees: {
    total: number;
    active: number;
    byPosition: { position: import('./staff.contracts').EmployeePosition; count: number }[];
  };
  /** Active employees on a shift right now and/or clocked in. */
  onDutyNow: {
    employeeId: string;
    name: string;
    position: import('./staff.contracts').EmployeePosition;
    shift: import('./staff.contracts').ShiftDto | null;
    clockedInAt: string | null;
  }[];
  presentNow: number;
  /** Every shift of the day, sorted by start (timeline / calendar). */
  shifts: import('./staff.contracts').ShiftDto[];
}

/** GET /api/dashboard/kpis?from&to — business KPIs (memberships + shop − expenses). */
export interface FinanceKpis {
  from: string;
  to: string;
  /** Gross merchandise value: memberships at list price + shop sales before discounts. */
  gmv: number;
  discounts: number;
  refunds: number;
  cancellations: number;
  /** Net merchandise value: gmv − discounts − refunds − cancellations. */
  nmv: number;
  cashCollected: number;
  cogs: number;
  /** nmv − cogs */
  grossMargin: number;
  grossMarginPct: number;
  expenses: number;
  /** nmv − cogs − expenses */
  operatingProfit: number;
  operatingMarginPct: number;
  mrr: number;
  arpu: number;
  activeMembers: number;
  breakdown: {
    memberships: import('./membership.contracts').MembershipKpis | null;
    shop: import('./commerce.contracts').CommerceKpis | null;
  };
  monthly: { month: string; gmv: number; nmv: number; expenses: number; profit: number; marginPct: number }[];
}
