import { Controller, UseFilters } from '@nestjs/common';
import { MessagePattern, Payload } from '@nestjs/microservices';
import {
  AccessDecision,
  AllRpcExceptionsFilter,
  CreateDoorRequest,
  DoorDto,
  IdRequest,
  ListDoorsRequest,
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

  /** Payload `{ includeConfig? }`: the masked config is sent only to door editors (ADMIN). */
  @MessagePattern(PATTERNS.doors.list)
  list(@Payload() request: ListDoorsRequest): Promise<DoorDto[]> {
    return this.doors.list(request ?? {});
  }

  /** Payload `{ memberId }` (unused: every active door open to the app is listed). */
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
