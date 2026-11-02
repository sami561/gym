import { Controller } from '@nestjs/common';
import { MessagePattern, Payload } from '@nestjs/microservices';
import {
  CreateShiftRequest,
  IdRequest,
  ListShiftsRequest,
  OkResult,
  PATTERNS,
  ShiftDto,
  UpdateShiftRequest,
} from '@app/common';
import { ShiftsService } from './shifts.service';

@Controller()
export class ShiftsController {
  constructor(private readonly shifts: ShiftsService) {}

  @MessagePattern(PATTERNS.shifts.list)
  list(@Payload() request: ListShiftsRequest): Promise<ShiftDto[]> {
    return this.shifts.list(request ?? {});
  }

  @MessagePattern(PATTERNS.shifts.create)
  create(@Payload() request: CreateShiftRequest): Promise<ShiftDto[]> {
    return this.shifts.create(request);
  }

  @MessagePattern(PATTERNS.shifts.update)
  update(@Payload() request: UpdateShiftRequest): Promise<ShiftDto> {
    return this.shifts.update(request);
  }

  @MessagePattern(PATTERNS.shifts.remove)
  remove(@Payload() request: IdRequest): Promise<OkResult> {
    return this.shifts.remove(request);
  }
}
