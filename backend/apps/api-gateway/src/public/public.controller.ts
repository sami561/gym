import { Body, Controller, Get, Post, Query } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import {
  ClassSessionDto,
  GymInfo,
  PATTERNS,
  PlanDto,
  Public,
  PublicCoach,
  RoomDto,
  RpcClient,
  gymInfo,
} from '@app/common';
import { ClassRangeQuery, PublicTrialDto } from './public.dto';

@ApiTags('Public')
@Public()
@Controller('public')
export class PublicController {
  constructor(private readonly rpc: RpcClient) {}

  @Get('gym')
  gym(): GymInfo {
    return gymInfo();
  }

  @Get('plans')
  plans() {
    return this.rpc.send<PlanDto[]>(PATTERNS.plans.list, { includeInactive: false });
  }

  @Get('classes')
  classes(@Query() q: ClassRangeQuery) {
    return this.rpc.send<ClassSessionDto[]>(PATTERNS.classes.list, { from: q.from, to: q.to });
  }

  @Get('coaches')
  coaches() {
    return this.rpc.send<PublicCoach[]>(PATTERNS.users.publicCoaches, {});
  }

  @Get('rooms')
  async rooms() {
    const rooms = await this.rpc.send<RoomDto[]>(PATTERNS.rooms.list, {});
    return rooms.filter((r) => r.isActive);
  }

  /** "Séance d'essai gratuite" form of the website. */
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  @Post('trial')
  trial(@Body() dto: PublicTrialDto) {
    return this.rpc.send<{ ok: true }>(PATTERNS.leads.publicTrial, dto);
  }
}
