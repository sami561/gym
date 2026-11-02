import { Body, Controller, Get, Param, ParseUUIDPipe, Patch, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { AuthUser, CurrentUser, PATTERNS, PtSessionDto, Role, Roles, RpcClient } from '@app/common';
import { resolveCoachId } from './coach';
import { CreatePtSessionDto, ListPtSessionsQuery, UpdatePtSessionDto } from './training.dto';

@ApiTags('Entraînement — coaching privé')
@ApiBearerAuth()
@Roles(Role.ADMIN, Role.STAFF, Role.COACH)
@Controller('pt-sessions')
export class PtSessionsController {
  constructor(private readonly rpc: RpcClient) {}

  @Get()
  list(@Query() q: ListPtSessionsQuery) {
    return this.rpc.send<PtSessionDto[]>(PATTERNS.ptSessions.list, q);
  }

  @Post()
  create(@CurrentUser() user: AuthUser, @Body() dto: CreatePtSessionDto) {
    return this.rpc.send<PtSessionDto>(PATTERNS.ptSessions.create, {
      ...dto,
      coachId: resolveCoachId(user, dto.coachId),
    });
  }

  @Patch(':id')
  update(@Param('id', ParseUUIDPipe) id: string, @Body() dto: UpdatePtSessionDto) {
    return this.rpc.send<PtSessionDto>(PATTERNS.ptSessions.update, { id, data: dto });
  }
}
