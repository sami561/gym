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
