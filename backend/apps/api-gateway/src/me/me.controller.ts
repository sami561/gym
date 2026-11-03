import {
  Body,
  Controller,
  Delete,
  Get,
  Headers,
  HttpCode,
  Ip,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Put,
  Query,
  Res,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import type { Response } from 'express';
import {
  ACCESS_ROTATE_KEY_PATTERN,
  AccessDecision,
  AccessKey,
  AccessKeyRotation,
  AccessLogDto,
  AuthUser,
  BookingDto,
  ClassSessionDto,
  MemberBookingStanding,
  CurrentUser,
  IdRequest,
  MeResponse,
  MeasurementDto,
  MemberAccessInfo,
  MemberDoor,
  MemberDto,
  MemberPhoto,
  MemberProfile,
  OpenByAppRequest,
  PATTERNS,
  PtSessionDto,
  Role,
  Roles,
  RotateAccessKeyRequest,
  RpcClient,
  SetMemberPhotoRequest,
  toActor,
  UserDto,
  WorkoutProgramDto,
} from '@app/common';
import { ClassRangeQuery } from '../public/public.dto';
import {
  ApiPhotoDownload,
  ApiPhotoUpload,
  PhotoUploadInterceptor,
  UploadedPhoto,
  photoData,
  sendPhoto,
} from '../members/member-photo';
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

  /** New QR secret (phone lost or code shared): the codes shown until now stop working at once. */
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  @HttpCode(200)
  @Post('access-key/rotate')
  async rotateAccessKey(@CurrentUser() user: AuthUser): Promise<AccessKey> {
    const { key } = await this.rpc.send<AccessKeyRotation, RotateAccessKeyRequest>(ACCESS_ROTATE_KEY_PATTERN, {
      memberId: user.id,
      actor: toActor(user),
    });
    return key;
  }

  /** Doors the member may open from the app (active, allowAppOpen). */
  @Get('doors')
  doors(@CurrentUser() user: AuthUser) {
    return this.rpc.send<MemberDoor[]>(PATTERNS.doors.listForMember, { memberId: user.id });
  }

  /** The caller's address (req.ip, see TRUST_PROXY) is checked against APP_OPEN_ALLOWED_NETWORKS. */
  @Throttle({ default: { limit: 20, ttl: 60_000 } })
  @Post('doors/:doorId/open')
  openDoor(
    @CurrentUser() user: AuthUser,
    @Param('doorId', ParseUUIDPipe) doorId: string,
    @Body() dto: OpenDoorDto,
    @Ip() clientIp: string | undefined,
  ) {
    return this.rpc.send<AccessDecision, OpenByAppRequest>(PATTERNS.access.openByApp, {
      ...dto,
      memberId: user.id,
      doorId,
      ...(clientIp ? { clientIp } : {}),
    });
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

  /** The member's own photo (docs/API.md, Member photos); 404 'Aucune photo.'. */
  @ApiPhotoDownload()
  @Get('photo')
  async photo(
    @CurrentUser() user: AuthUser,
    @Query('v') version: string | undefined,
    @Headers('if-none-match') ifNoneMatch: string | undefined,
    @Res() res: Response,
  ): Promise<void> {
    const photo = await this.rpc.send<MemberPhoto, IdRequest>(PATTERNS.members.photoGet, { id: user.id });
    sendPhoto(res, photo, { version, ifNoneMatch });
  }

  /** multipart/form-data, file field `photo`: a JPEG of at most 512 KB, resized by the app beforehand. */
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @ApiPhotoUpload()
  @UseInterceptors(PhotoUploadInterceptor)
  @Put('photo')
  setPhoto(@CurrentUser() user: AuthUser, @UploadedFile() file: UploadedPhoto | undefined) {
    return this.rpc.send<MemberDto, SetMemberPhotoRequest>(PATTERNS.members.photoSet, {
      id: user.id,
      data: photoData(file),
    });
  }

  @Delete('photo')
  removePhoto(@CurrentUser() user: AuthUser) {
    return this.rpc.send<MemberDto, IdRequest>(PATTERNS.members.photoRemove, { id: user.id });
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
