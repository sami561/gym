import { Controller } from '@nestjs/common';
import { MessagePattern, Payload } from '@nestjs/microservices';
import {
  CreateLeaveRequest,
  DecideLeaveRequest,
  IdRequest,
  LeaveDto,
  ListLeavesRequest,
  OkResult,
  PATTERNS,
} from '@app/common';
import { LeavesService } from './leaves.service';

@Controller()
export class LeavesController {
  constructor(private readonly leaves: LeavesService) {}

  @MessagePattern(PATTERNS.leaves.list)
  list(@Payload() request: ListLeavesRequest): Promise<LeaveDto[]> {
    return this.leaves.list(request ?? {});
  }

  @MessagePattern(PATTERNS.leaves.create)
  create(@Payload() request: CreateLeaveRequest): Promise<LeaveDto> {
    return this.leaves.create(request);
  }

  @MessagePattern(PATTERNS.leaves.decide)
  decide(@Payload() request: DecideLeaveRequest): Promise<LeaveDto> {
    return this.leaves.decide(request);
  }

  @MessagePattern(PATTERNS.leaves.remove)
  remove(@Payload() request: IdRequest): Promise<OkResult> {
    return this.leaves.remove(request);
  }
}
