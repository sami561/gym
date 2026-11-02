import { Body, Controller, Delete, Get, Param, ParseUUIDPipe, Patch, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import {
  AuthUser,
  CreateMemberResult,
  CurrentUser,
  LeadActivityDto as LeadActivityResult,
  LeadDto,
  PATTERNS,
  Role,
  Roles,
  RpcClient,
  toActor,
} from '@app/common';
import { ConvertLeadDto, CreateLeadDto, LeadActivityDto, ListLeadsQuery, UpdateLeadDto } from './leads.dto';

@ApiTags('Prospects (CRM)')
@ApiBearerAuth()
@Roles(Role.ADMIN, Role.STAFF)
@Controller('leads')
export class LeadsController {
  constructor(private readonly rpc: RpcClient) {}

  @Get()
  list(@Query() q: ListLeadsQuery) {
    return this.rpc.send<LeadDto[]>(PATTERNS.leads.list, q);
  }

  @Post()
  create(@Body() dto: CreateLeadDto) {
    return this.rpc.send<LeadDto>(PATTERNS.leads.create, dto);
  }

  @Get(':id')
  get(@Param('id', ParseUUIDPipe) id: string) {
    return this.rpc.send<LeadDto>(PATTERNS.leads.get, { id });
  }

  @Patch(':id')
  update(@Param('id', ParseUUIDPipe) id: string, @Body() dto: UpdateLeadDto) {
    return this.rpc.send<LeadDto>(PATTERNS.leads.update, { id, data: dto });
  }

  @Delete(':id')
  remove(@Param('id', ParseUUIDPipe) id: string) {
    return this.rpc.send<{ ok: true }>(PATTERNS.leads.remove, { id });
  }

  @Post(':id/activities')
  addActivity(@CurrentUser() user: AuthUser, @Param('id', ParseUUIDPipe) id: string, @Body() dto: LeadActivityDto) {
    return this.rpc.send<LeadActivityResult>(PATTERNS.leads.addActivity, { ...dto, leadId: id, actor: toActor(user) });
  }

  @Post(':id/convert')
  convert(@CurrentUser() user: AuthUser, @Param('id', ParseUUIDPipe) id: string, @Body() dto: ConvertLeadDto) {
    return this.rpc.send<CreateMemberResult>(PATTERNS.leads.convert, { ...dto, leadId: id, actor: toActor(user) });
  }
}
