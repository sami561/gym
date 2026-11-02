import { Body, Controller, Get, Param, ParseUUIDPipe, Patch, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { AuthUser, CurrentUser, MaintenanceTicketDto, PATTERNS, Role, Roles, RpcClient } from '@app/common';
import { CreateTicketDto, ListTicketsQuery, UpdateTicketDto } from './facility.dto';

@ApiTags('Maintenance')
@ApiBearerAuth()
@Roles(Role.ADMIN, Role.STAFF)
@Controller('maintenance')
export class MaintenanceController {
  constructor(private readonly rpc: RpcClient) {}

  @Get()
  list(@Query() q: ListTicketsQuery) {
    return this.rpc.send<MaintenanceTicketDto[]>(PATTERNS.maintenance.list, q);
  }

  @Post()
  create(@CurrentUser() user: AuthUser, @Body() dto: CreateTicketDto) {
    return this.rpc.send<MaintenanceTicketDto>(PATTERNS.maintenance.create, {
      ...dto,
      reportedByName: dto.reportedByName ?? user.name,
    });
  }

  @Patch(':id')
  update(@Param('id', ParseUUIDPipe) id: string, @Body() dto: UpdateTicketDto) {
    return this.rpc.send<MaintenanceTicketDto>(PATTERNS.maintenance.update, { id, data: dto });
  }
}
