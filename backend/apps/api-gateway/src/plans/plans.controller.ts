import { Body, Controller, Delete, Get, Param, ParseUUIDPipe, Patch, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { PATTERNS, PlanDto, Role, Roles, RpcClient } from '@app/common';
import { CreatePlanDto, ListPlansQuery, UpdatePlanDto } from './plans.dto';

@ApiTags('Offres')
@ApiBearerAuth()
@Roles(Role.ADMIN, Role.STAFF)
@Controller('plans')
export class PlansController {
  constructor(private readonly rpc: RpcClient) {}

  @Get()
  list(@Query() q: ListPlansQuery) {
    return this.rpc.send<PlanDto[]>(PATTERNS.plans.list, { includeInactive: q.includeInactive ?? true });
  }

  @Roles(Role.ADMIN)
  @Post()
  create(@Body() dto: CreatePlanDto) {
    return this.rpc.send<PlanDto>(PATTERNS.plans.create, dto);
  }

  @Roles(Role.ADMIN)
  @Patch(':id')
  update(@Param('id', ParseUUIDPipe) id: string, @Body() dto: UpdatePlanDto) {
    return this.rpc.send<PlanDto>(PATTERNS.plans.update, { id, data: dto });
  }

  @Roles(Role.ADMIN)
  @Delete(':id')
  remove(@Param('id', ParseUUIDPipe) id: string) {
    return this.rpc.send<{ ok: true }>(PATTERNS.plans.remove, { id });
  }
}
