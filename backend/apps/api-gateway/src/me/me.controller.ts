import { Body, Controller, Delete, Get, Param, ParseUUIDPipe, Patch, Post, Put, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import {
  AccessDecision,
  AccessKey,
  AccessLogDto,
  AuthUser,
  BookingDto,
  ClassSessionDto,
  MemberBookingStanding,
  CurrentUser,
  MeResponse,
  MeasurementDto,
  MemberAccessInfo,
  MemberDoor,
  MemberDto,
  MemberProfile,
  PATTERNS,
  PtSessionDto,
  Role,
  Roles,
  RpcClient,
  UserDto,
  WorkoutProgramDto,
} from '@app/common';
import { ClassRangeQuery } from '../public/public.dto';
import {
  BookDto,
  BookingsQuery,
  LimitQuery,
  OpenDoorDto,
  PushTokenDto,
  SelfMeasurementDto,
  UpdateMeDto,
} from './me.dto';

/** Member self-service (mobile app). The member id is the authenticated user id. */
@ApiTags('Espace membre')
@ApiBearerAuth()
@Roles(Role.MEMBER)
@Controller('me')
export class MeController {
  constructor(private readonly rpc: RpcClient) {}

  @Get()
  async me(@CurrentUser() user: AuthUser): Promise<MeResponse> {
    const [account, profile, access] = await Promise.all([
      this.rpc.send<UserDto>(PATTERNS.users.get, { id: user.id }),
      this.rpc.send<MemberProfile>(PATTERNS.members.profile, { id: user.id }),
      this.rpc.send<MemberAccessInfo>(PATTERNS.access.memberInfo, { memberId: user.id }),
    ]);
    return { user: account, profile, access };
  }

  @Patch()
  update(@CurrentUser() user: AuthUser, @Body() dto: UpdateMeDto) {
    return this.rpc.send<MemberDto>(PATTERNS.members.update, { id: user.id, data: dto });
  }

  @Get('access-key')
  accessKey(@CurrentUser() user: AuthUser) {
    return this.rpc.send<AccessKey>(PATTERNS.access.key, { memberId: user.id });
  }

  @Get('doors')
  doors(@CurrentUser() user: AuthUser) {
    return this.rpc.send<MemberDoor[]>(PATTERNS.doors.listForMember, { memberId: user.id });
  }

  @Throttle({ default: { limit: 20, ttl: 60_000 } })
  @Post('doors/:doorId/open')
  openDoor(
    @CurrentUser() user: AuthUser,
    @Param('doorId', ParseUUIDPipe) doorId: string,
    @Body() dto: OpenDoorDto,
  ) {
    return this.rpc.send<AccessDecision>(PATTERNS.access.openByApp, { memberId: user.id, doorId, ...dto });
  }

  @Get('visits')
  visits(@CurrentUser() user: AuthUser, @Query() q: LimitQuery) {
    return this.rpc.send<AccessLogDto[]>(PATTERNS.access.logs, { memberId: user.id, limit: q.limit ?? 30 });
  }

  @Get('classes')
  classes(@CurrentUser() user: AuthUser, @Query() q: ClassRangeQuery) {
    return this.rpc.send<ClassSessionDto[]>(PATTERNS.classes.list, { ...q, memberId: user.id });
  }

  @Get('bookings')
  bookings(@CurrentUser() user: AuthUser, @Query() q: BookingsQuery) {
    return this.rpc.send<BookingDto[]>(PATTERNS.bookings.mine, { memberId: user.id, includePast: q.includePast });
  }

  @Post('bookings')
  book(@CurrentUser() user: AuthUser, @Body() dto: BookDto) {
    return this.rpc.send<BookingDto>(PATTERNS.bookings.create, {
      sessionId: dto.sessionId,
      spotNumber: dto.spotNumber,
      memberId: user.id,
    });
  }

  /** No-show strikes and booking suspension, if any. */
  @Get('booking-standing')
  bookingStanding(@CurrentUser() user: AuthUser) {
    return this.rpc.send<MemberBookingStanding>(PATTERNS.bookings.standing, { memberId: user.id });
  }

  @Delete('bookings/:id')
  cancelBooking(@CurrentUser() user: AuthUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.rpc.send<BookingDto>(PATTERNS.bookings.cancel, { bookingId: id, memberId: user.id });
  }

  @Put('push-token')
  pushToken(@CurrentUser() user: AuthUser, @Body() dto: PushTokenDto) {
    return this.rpc.send<{ ok: true }>(PATTERNS.notifications.registerPush, { userId: user.id, token: dto.token });
  }

  @Get('programs')
  programs(@CurrentUser() user: AuthUser) {
    return this.rpc.send<WorkoutProgramDto[]>(PATTERNS.programs.list, { memberId: user.id, activeOnly: true });
  }

  @Get('measurements')
  measurements(@CurrentUser() user: AuthUser) {
    return this.rpc.send<MeasurementDto[]>(PATTERNS.measurements.list, { memberId: user.id });
  }

  @Post('measurements')
  addMeasurement(@CurrentUser() user: AuthUser, @Body() dto: SelfMeasurementDto) {
    return this.rpc.send<MeasurementDto>(PATTERNS.measurements.create, {
      ...dto,
      memberId: user.id,
      recordedByName: user.name,
    });
  }

  @Get('pt-sessions')
  ptSessions(@CurrentUser() user: AuthUser) {
    return this.rpc.send<PtSessionDto[]>(PATTERNS.ptSessions.list, { memberId: user.id });
  }
}
