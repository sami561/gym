import { Controller, Get, Query } from '@nestjs/common';
import { ApiSecurity, ApiTags } from '@nestjs/swagger';
import { IsIn, IsOptional } from 'class-validator';
import {
  ApiKeyAuth,
  BirthdayItem,
  ClassSessionDto,
  ClassStats,
  DailyMembershipReport,
  EquipmentDto,
  ExpiredItem,
  ExpiringItem,
  InactiveMember,
  LeadDto,
  PATTERNS,
  ProductDto,
  Recipient,
  RpcClient,
  TodayAccessStats,
  addDays,
  gymInfo,
  toDateOnly,
} from '@app/common';
import { DateQuery, DaysQuery } from '../dashboard/dashboard.dto';

class SegmentQuery {
  @IsOptional()
  @IsIn(['active', 'expired', 'all'])
  segment?: 'active' | 'expired' | 'all';
}

/** Feeds for scheduled n8n workflows — header x-api-key: AUTOMATION_API_KEY. */
@ApiTags('Automatisations (n8n)')
@ApiSecurity('automation')
@ApiKeyAuth()
@Controller('automation')
export class AutomationController {
  constructor(private readonly rpc: RpcClient) {}

  @Get('gym')
  gym() {
    return gymInfo();
  }

  @Get('recipients')
  recipients(@Query() q: SegmentQuery) {
    return this.rpc.send<Recipient[]>(PATTERNS.membershipAutomation.recipients, { segment: q.segment ?? 'active' });
  }

  @Get('birthdays')
  birthdays() {
    return this.rpc.send<BirthdayItem[]>(PATTERNS.membershipAutomation.birthdays, {});
  }

  @Get('expired')
  expired(@Query() q: DaysQuery) {
    return this.rpc.send<ExpiredItem[]>(PATTERNS.membershipAutomation.expired, { days: q.days ?? 7 });
  }

  @Get('expiring')
  expiring(@Query() q: DaysQuery) {
    return this.rpc.send<ExpiringItem[]>(PATTERNS.membershipStats.expiring, { days: q.days ?? 7 });
  }

  @Get('inactive')
  inactive(@Query() q: DaysQuery) {
    return this.rpc.send<InactiveMember[]>(PATTERNS.notifications.inactiveMembers, { days: q.days ?? 14 });
  }

  @Get('schedule')
  schedule(@Query() q: DaysQuery) {
    const from = new Date();
    const to = new Date(from.getTime() + (q.days ?? 7) * 86_400_000);
    return this.rpc.send<ClassSessionDto[]>(PATTERNS.classes.list, { from: from.toISOString(), to: to.toISOString() });
  }

  @Get('daily-report')
  async dailyReport(@Query() q: DateQuery) {
    const date = q.date ?? addDays(toDateOnly(), -1);
    const [membership, access, classes] = await Promise.all([
      this.rpc.send<DailyMembershipReport>(PATTERNS.membershipAutomation.dailyReport, { date }),
      this.rpc.send<TodayAccessStats>(PATTERNS.access.statsToday, { date }).catch(() => null),
      this.rpc.send<ClassStats>(PATTERNS.classes.stats, { date }).catch(() => null),
    ]);
    return { date, membership, access, classes };
  }

  @Get('low-stock')
  lowStock() {
    return this.rpc.send<ProductDto[]>(PATTERNS.products.list, { lowStockOnly: true });
  }

  @Get('maintenance-due')
  maintenanceDue(@Query() q: DaysQuery) {
    return this.rpc.send<EquipmentDto[]>(PATTERNS.equipment.list, { dueWithinDays: q.days ?? 7 });
  }

  @Get('leads-follow-up')
  leadsFollowUp() {
    return this.rpc.send<LeadDto[]>(PATTERNS.leads.list, { dueOnly: true });
  }
}
