import { Controller, UseFilters } from '@nestjs/common';
import { MessagePattern, Payload } from '@nestjs/microservices';
import {
  AccessDecision,
  AllRpcExceptionsFilter,
  CreateDoorRequest,
  DoorDto,
  IdRequest,
  ManualOpenRequest,
  MemberDoor,
  OkResult,
  PATTERNS,
  UpdateDoorRequest,
} from '@app/common';
import { AccessService } from '../access/access.service';
import { DoorsService } from './doors.service';

@UseFilters(AllRpcExceptionsFilter)
@Controller()
export class DoorsController {
  constructor(
    private readonly doors: DoorsService,
    private readonly access: AccessService,
  ) {}

  @MessagePattern(PATTERNS.doors.list)
  list(): Promise<DoorDto[]> {
    return this.doors.list();
  }

  /** Payload `{ memberId }` (unused: every active door is listed). */
  @MessagePattern(PATTERNS.doors.listForMember)
  listForMember(): Promise<MemberDoor[]> {
    return this.doors.listForMember();
  }

  @MessagePattern(PATTERNS.doors.create)
  create(@Payload() request: CreateDoorRequest): Promise<DoorDto> {
    return this.doors.create(request);
  }

  @MessagePattern(PATTERNS.doors.update)
  update(@Payload() request: UpdateDoorRequest): Promise<DoorDto> {
    return this.doors.update(request);
  }

  @MessagePattern(PATTERNS.doors.remove)
  remove(@Payload() request: IdRequest): Promise<OkResult> {
    return this.doors.remove(request);
  }

  @MessagePattern(PATTERNS.doors.open)
  open(@Payload() request: ManualOpenRequest): Promise<AccessDecision> {
    return this.access.manualOpen(request);
  }
}
