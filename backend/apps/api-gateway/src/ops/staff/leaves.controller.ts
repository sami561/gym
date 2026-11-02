import { Body, Controller, Delete, Get, Param, ParseUUIDPipe, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { AuthUser, CurrentUser, LeaveDto, PATTERNS, Role, Roles, RpcClient, toActor } from '@app/common';
import { CreateLeaveDto, DecideLeaveDto, ListLeavesQuery } from './staff.dto';

@ApiTags('Congés')
@ApiBearerAuth()
@Roles(Role.ADMIN, Role.STAFF)
@Controller('leaves')
export class LeavesController {
  constructor(private readonly rpc: RpcClient) {}

  @Get()
  list(@Query() q: ListLeavesQuery) {
    return this.rpc.send<LeaveDto[]>(PATTERNS.leaves.list, q);
  }

  @Post()
  create(@Body() dto: CreateLeaveDto) {
    return this.rpc.send<LeaveDto>(PATTERNS.leaves.create, dto);
  }

  @Roles(Role.ADMIN)
  @Post(':id/decision')
  decide(@CurrentUser() user: AuthUser, @Param('id', ParseUUIDPipe) id: string, @Body() dto: DecideLeaveDto) {
    return this.rpc.send<LeaveDto>(PATTERNS.leaves.decide, { id, status: dto.status, actor: toActor(user) });
  }

  @Delete(':id')
  remove(@Param('id', ParseUUIDPipe) id: string) {
    return this.rpc.send<{ ok: true }>(PATTERNS.leaves.remove, { id });
  }
}
