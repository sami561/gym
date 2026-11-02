import { Controller } from '@nestjs/common';
import { MessagePattern, Payload } from '@nestjs/microservices';
import { AttendanceDto, ClockRequest, ListAttendanceRequest, PATTERNS } from '@app/common';
import { AttendanceService } from './attendance.service';

@Controller()
export class AttendanceController {
  constructor(private readonly attendance: AttendanceService) {}

  @MessagePattern(PATTERNS.attendance.clockIn)
  clockIn(@Payload() request: ClockRequest): Promise<AttendanceDto> {
    return this.attendance.clockIn(request);
  }

  @MessagePattern(PATTERNS.attendance.clockOut)
  clockOut(@Payload() request: ClockRequest): Promise<AttendanceDto> {
    return this.attendance.clockOut(request);
  }

  @MessagePattern(PATTERNS.attendance.list)
  list(@Payload() request: ListAttendanceRequest): Promise<AttendanceDto[]> {
    return this.attendance.list(request ?? {});
  }
}
