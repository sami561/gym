import { Body, Controller, Get, Headers, Param, ParseUUIDPipe, Post, Query, Res } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import type { Response } from 'express';
import {
  ClassSessionDto,
  GymInfo,
  IdRequest,
  PATTERNS,
  PlanDto,
  Public,
  PublicCoach,
  RoomDto,
  RpcClient,
  StoredPhoto,
  gymInfo,
} from '@app/common';
import { ApiPhotoDownload, sendPhoto } from '../common/photo';
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

  /**
   * The uploaded photo of a coach (docs/API.md, Coach photos), the `avatarUrl` of PublicCoach: JPEG without
   * metadata, cacheable by anyone. 404 'Aucune photo.' without photo, or once the coach is demoted or deactivated.
   */
  @ApiPhotoDownload('Le v de avatarUrl')
  @Get('coaches/:id/photo')
  async coachPhoto(
    @Param('id', ParseUUIDPipe) id: string,
    @Query('v') version: string | undefined,
    @Headers('if-none-match') ifNoneMatch: string | undefined,
    @Res() res: Response,
  ): Promise<void> {
    const photo = await this.rpc.send<StoredPhoto, IdRequest>(PATTERNS.users.photoGet, { id });
    sendPhoto(res, photo, { audience: 'public', version, ifNoneMatch });
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
