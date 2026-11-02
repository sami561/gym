import { Controller, UseFilters } from '@nestjs/common';
import { MessagePattern, Payload } from '@nestjs/microservices';
import {
  AccessDecision,
  AccessKey,
  AccessLogDto,
  AllRpcExceptionsFilter,
  CheckinStats,
  CheckinStatsRequest,
  HealthResult,
  healthResult,
  LastVisit,
  LastVisitsRequest,
  ListLogsRequest,
  MemberAccessInfo,
  OpenByAppRequest,
  PATTERNS,
  ScanRequest,
  SetCardRequest,
  TodayAccessStats,
  TodayStatsRequest,
} from '@app/common';
import { AccessLogsService } from '../logs/access-logs.service';
import { AccessStatsService } from '../logs/access-stats.service';
import { AccessMembersService } from '../members/access-members.service';
import { AccessService } from './access.service';

/** Request payload of access.key and access.member-info. */
export interface MemberIdRequest {
  memberId: string;
}

// Controller-scoped filter: in a hybrid app the global filter only covers HTTP.
@UseFilters(AllRpcExceptionsFilter)
@Controller()
export class AccessController {
  constructor(
    private readonly access: AccessService,
    private readonly members: AccessMembersService,
    private readonly logs: AccessLogsService,
    private readonly stats: AccessStatsService,
  ) {}

  @MessagePattern(PATTERNS.access.key)
  key(@Payload() request: MemberIdRequest): Promise<AccessKey> {
    return this.members.accessKey(request?.memberId);
  }

  @MessagePattern(PATTERNS.access.openByApp)
  openByApp(@Payload() request: OpenByAppRequest): Promise<AccessDecision> {
    return this.access.openByApp(request);
  }

  @MessagePattern(PATTERNS.access.scan)
  scan(@Payload() request: ScanRequest): Promise<AccessDecision> {
    return this.access.scan(request);
  }

  @MessagePattern(PATTERNS.access.logs)
  logsList(@Payload() request: ListLogsRequest): Promise<AccessLogDto[]> {
    return this.logs.list(request ?? {});
  }

  @MessagePattern(PATTERNS.access.memberInfo)
  async memberInfo(@Payload() request: MemberIdRequest): Promise<MemberAccessInfo> {
    const memberId = String(request?.memberId ?? '');
    return this.stats.memberInfo(await this.members.findById(memberId), memberId);
  }

  @MessagePattern(PATTERNS.access.setCard)
  async setCard(@Payload() request: SetCardRequest): Promise<MemberAccessInfo> {
    const member = await this.members.setCard(request);
    return this.stats.memberInfo(member, member.memberId);
  }

  @MessagePattern(PATTERNS.access.lastVisits)
  lastVisits(@Payload() request: LastVisitsRequest): Promise<LastVisit[]> {
    return this.stats.lastVisits(request?.memberIds);
  }

  @MessagePattern(PATTERNS.access.statsToday)
  statsToday(@Payload() request: TodayStatsRequest): Promise<TodayAccessStats> {
    return this.stats.today(request?.date);
  }

  @MessagePattern(PATTERNS.access.statsCheckins)
  statsCheckins(@Payload() request: CheckinStatsRequest): Promise<CheckinStats> {
    return this.stats.checkins(request?.days);
  }

  @MessagePattern(PATTERNS.access.health)
  health(): HealthResult {
    return healthResult('access-service');
  }
}
