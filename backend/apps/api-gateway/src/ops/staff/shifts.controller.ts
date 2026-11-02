import { Body, Controller, Delete, Get, Param, ParseUUIDPipe, Patch, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { PATTERNS, Role, Roles, RpcClient, ShiftDto } from '@app/common';
import { CreateShiftDto, ListShiftsQuery, UpdateShiftDto } from './staff.dto';

@ApiTags('Planning du personnel')
@ApiBearerAuth()
@Roles(Role.ADMIN, Role.STAFF)
@Controller('shifts')
export class ShiftsController {
  constructor(private readonly rpc: RpcClient) {}

  @Get()
  list(@Query() q: ListShiftsQuery) {
    return this.rpc.send<ShiftDto[]>(PATTERNS.shifts.list, q);
  }

  /** One shift per repeated week. */
  @Post()
  create(@Body() dto: CreateShiftDto) {
    return this.rpc.send<ShiftDto[]>(PATTERNS.shifts.create, dto);
  }

  @Patch(':id')
  update(@Param('id', ParseUUIDPipe) id: string, @Body() dto: UpdateShiftDto) {
    return this.rpc.send<ShiftDto>(PATTERNS.shifts.update, { id, data: dto });
  }

  @Delete(':id')
  remove(@Param('id', ParseUUIDPipe) id: string) {
    return this.rpc.send<{ ok: true }>(PATTERNS.shifts.remove, { id });
  }
}
