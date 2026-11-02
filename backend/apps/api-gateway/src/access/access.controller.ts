import { Body, Controller, Get, HttpCode, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import {
  AccessDecision,
  AccessLogDto,
  AuthUser,
  CurrentUser,
  ListLogsRequest,
  PATTERNS,
  Role,
  Roles,
  RpcClient,
  toActor,
} from '@app/common';
import { ListLogsQuery, ScanDto } from './access.dto';

@ApiTags('Contrôle d’accès')
@ApiBearerAuth()
@Roles(Role.ADMIN, Role.STAFF)
@Controller('access')
export class AccessController {
  constructor(private readonly rpc: RpcClient) {}

  /** ADMIN also gets the position and address of app openings (`context`). */
  @Get('logs')
  logs(@CurrentUser() user: AuthUser, @Query() q: ListLogsQuery) {
    return this.rpc.send<AccessLogDto[], ListLogsRequest>(PATTERNS.access.logs, {
      ...q,
      limit: q.limit ?? 50,
      includeContext: user.role === Role.ADMIN,
    });
  }

  /** QR code scanned at the reception / kiosk: opens the door when the member is entitled. */
  @Throttle({ default: { limit: 60, ttl: 60_000 } })
  @HttpCode(200)
  @Post('scan')
  scan(@CurrentUser() user: AuthUser, @Body() dto: ScanDto) {
    return this.rpc.send<AccessDecision>(PATTERNS.access.scan, { ...dto, actor: toActor(user) });
  }
}
