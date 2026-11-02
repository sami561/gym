import { Body, Controller, Get, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { AttendanceDto, PATTERNS, Role, Roles, RpcClient } from '@app/common';
import { ClockDto, ListAttendanceQuery } from './staff.dto';

@ApiTags('Pointage')
@ApiBearerAuth()
@Roles(Role.ADMIN, Role.STAFF)
@Controller('attendance')
export class AttendanceController {
  constructor(private readonly rpc: RpcClient) {}

  @Post('clock-in')
  clockIn(@Body() dto: ClockDto) {
    return this.rpc.send<AttendanceDto>(PATTERNS.attendance.clockIn, clockPayload(dto));
  }

  @Post('clock-out')
  clockOut(@Body() dto: ClockDto) {
    return this.rpc.send<AttendanceDto>(PATTERNS.attendance.clockOut, clockPayload(dto));
  }

  @Get()
  list(@Query() q: ListAttendanceQuery) {
    return this.rpc.send<AttendanceDto[]>(PATTERNS.attendance.list, q);
  }
}

/** A time given by staff is a manual correction; otherwise the reception kiosk clocks "now". */
function clockPayload(dto: ClockDto) {
  return { employeeId: dto.employeeId, at: dto.at, source: dto.source ?? (dto.at ? 'MANUAL' : 'KIOSK') };
}
