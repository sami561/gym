import { Controller } from '@nestjs/common';
import { MessagePattern, Payload } from '@nestjs/microservices';
import {
  CreateEquipmentRequest,
  EquipmentDto,
  IdRequest,
  ListEquipmentRequest,
  OkResult,
  PATTERNS,
  UpdateEquipmentRequest,
} from '@app/common';
import { EquipmentService } from './equipment.service';

@Controller()
export class EquipmentController {
  constructor(private readonly equipment: EquipmentService) {}

  @MessagePattern(PATTERNS.equipment.list)
  list(@Payload() request: ListEquipmentRequest): Promise<EquipmentDto[]> {
    return this.equipment.list(request ?? {});
  }

  @MessagePattern(PATTERNS.equipment.get)
  get(@Payload() request: IdRequest): Promise<EquipmentDto> {
    return this.equipment.get(request);
  }

  @MessagePattern(PATTERNS.equipment.create)
  create(@Payload() request: CreateEquipmentRequest): Promise<EquipmentDto> {
    return this.equipment.create(request);
  }

  @MessagePattern(PATTERNS.equipment.update)
  update(@Payload() request: UpdateEquipmentRequest): Promise<EquipmentDto> {
    return this.equipment.update(request);
  }

  @MessagePattern(PATTERNS.equipment.remove)
  remove(@Payload() request: IdRequest): Promise<OkResult> {
    return this.equipment.remove(request);
  }
}
