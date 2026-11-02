import { Controller, Get, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import {
  AttendanceDto,
  CheckinStats,
  ClassStats,
  CommerceKpis,
  CommerceStats,
  DashboardSummary,
  EmployeeDto,
  EmployeeStatus,
  ExpiringItem,
  FacilityStats,
  FinanceKpis,
  LeadStats,
  MembersAnalytics,
  MembershipKpis,
  MembershipSummary,
  OperationsSummary,
  PATTERNS,
  PlanMixItem,
  RevenuePoint,
  Role,
  Roles,
  RpcClient,
  ShiftDto,
  StaffStats,
  TeamOverview,
  TodayAccessStats,
  TrainingStats,
  WorkflowStats,
  addDays,
  fullName,
  parseDateOnly,
  toDateOnly,
} from '@app/common';
import { DateQuery, DaysQuery, MonthsQuery, PeriodQuery } from './dashboard.dto';
import { combineKpis } from './kpis';

@ApiTags('Tableau de bord')
@ApiBearerAuth()
@Roles(Role.ADMIN, Role.STAFF)
@Controller('dashboard')
export class DashboardController {
  constructor(private readonly rpc: RpcClient) {}

  @Get('summary')
  async summary(): Promise<DashboardSummary> {
    const [membership, access, classes] = await Promise.all([
      this.rpc.send<MembershipSummary>(PATTERNS.membershipStats.summary, {}),
      this.optional<TodayAccessStats>(PATTERNS.access.statsToday, {}),
      this.optional<ClassStats>(PATTERNS.classes.stats, {}),
    ]);
    return {
      members: {
        total: membership.totalMembers,
        active: membership.activeMembers,
        newThisMonth: membership.newThisMonth,
        expiringSoon: membership.expiringSoon,
      },
      revenue: {
        today: membership.revenueToday,
        thisMonth: membership.revenueThisMonth,
        lastMonth: membership.revenueLastMonth,
      },
      checkIns: {
        today: access?.checkIns ?? 0,
        uniqueToday: access?.uniqueVisitors ?? 0,
        deniedToday: access?.denied ?? 0,
      },
      classes: {
        today: classes?.sessionsToday ?? 0,
        upcomingBookings: classes?.upcomingBookings ?? 0,
        fillRate30d: classes?.fillRate30d ?? 0,
      },
    };
  }

  @Get('revenue')
  revenue(@Query() q: MonthsQuery) {
    return this.rpc.send<RevenuePoint[]>(PATTERNS.membershipStats.revenue, { months: q.months ?? 12 });
  }

  @Get('checkins')
  checkins(@Query() q: DaysQuery) {
    return this.rpc.send<CheckinStats>(PATTERNS.access.statsCheckins, { days: q.days ?? 30 });
  }

  @Get('expiring')
  expiring(@Query() q: DaysQuery) {
    return this.rpc.send<ExpiringItem[]>(PATTERNS.membershipStats.expiring, { days: q.days ?? 7 });
  }

  @Get('plan-mix')
  planMix() {
    return this.rpc.send<PlanMixItem[]>(PATTERNS.membershipStats.planMix, {});
  }

  @Get('members-analytics')
  membersAnalytics() {
    return this.rpc.send<MembersAnalytics>(PATTERNS.membershipStats.analytics, {});
  }

  /** Every back-office module at a glance; a module that is down shows as null. */
  @Get('operations')
  async operations(): Promise<OperationsSummary> {
    const [staff, facility, commerce, training, leads, workflows] = await Promise.all([
      this.optional<StaffStats>(PATTERNS.staffStats.summary, {}),
      this.optional<FacilityStats>(PATTERNS.facilityStats.summary, {}),
      this.optional<CommerceStats>(PATTERNS.finance.stats, {}),
      this.optional<TrainingStats>(PATTERNS.trainingStats.summary, {}),
      this.optional<LeadStats>(PATTERNS.leads.stats, {}),
      this.optional<WorkflowStats>(PATTERNS.workflowStats.summary, {}),
    ]);
    return { staff, facility, commerce, training, leads, workflows };
  }

  /** Who works when: headcount, who is on duty now, and the day's shifts. */
  @Get('team')
  async team(@Query() q: DateQuery): Promise<TeamOverview> {
    const date = q.date ?? toDateOnly();
    const from = parseDateOnly(date).toISOString();
    const to = parseDateOnly(addDays(date, 1)).toISOString();
    const [employees, shifts, attendance] = await Promise.all([
      this.rpc.send<EmployeeDto[]>(PATTERNS.employees.list, {}),
      this.rpc.send<ShiftDto[]>(PATTERNS.shifts.list, { from, to }),
      this.rpc.send<AttendanceDto[]>(PATTERNS.attendance.list, { from, to }),
    ]);
    const active = employees.filter((e) => e.status === EmployeeStatus.ACTIVE);
    const byPosition = new Map<EmployeeDto['position'], number>();
    for (const e of active) byPosition.set(e.position, (byPosition.get(e.position) ?? 0) + 1);

    const now = Date.now();
    const isToday = date === toDateOnly();
    const onDutyNow = isToday
      ? active
          .map((e) => {
            const shift =
              shifts.find(
                (s) => s.employeeId === e.id && Date.parse(s.startsAt) <= now && now < Date.parse(s.endsAt),
              ) ?? null;
            const open = attendance.find((a) => a.employeeId === e.id && a.clockOut === null) ?? null;
            return { employeeId: e.id, name: fullName(e), position: e.position, shift, clockedInAt: open?.clockIn ?? null };
          })
          .filter((row) => row.shift || row.clockedInAt)
      : [];

    return {
      date,
      employees: {
        total: employees.length,
        active: active.length,
        byPosition: [...byPosition.entries()].map(([position, count]) => ({ position, count })),
      },
      onDutyNow,
      presentNow: isToday ? attendance.filter((a) => a.clockOut === null).length : 0,
      shifts: [...shifts].sort((a, b) => a.startsAt.localeCompare(b.startsAt)),
    };
  }

  /** GMV, NMV, gross and operating margins, MRR, ARPU (ADMIN). */
  @Roles(Role.ADMIN)
  @Get('kpis')
  async kpis(@Query() q: PeriodQuery): Promise<FinanceKpis> {
    const to = q.to ?? toDateOnly();
    const from = q.from ?? `${to.slice(0, 7)}-01`;
    const [memberships, shop] = await Promise.all([
      this.optional<MembershipKpis>(PATTERNS.membershipStats.kpis, { from, to }),
      this.optional<CommerceKpis>(PATTERNS.finance.kpis, { from, to }),
    ]);
    return combineKpis(from, to, memberships, shop);
  }

  private optional<T>(pattern: string, data: unknown): Promise<T | null> {
    return this.rpc.send<T>(pattern, data, 5_000).catch(() => null);
  }
}
