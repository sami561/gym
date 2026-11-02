import { Controller } from '@nestjs/common';
import { MessagePattern, Payload } from '@nestjs/microservices';
import {
  CreateTicketRequest,
  ListTicketsRequest,
  MaintenanceTicketDto,
  PATTERNS,
  UpdateTicketRequest,
} from '@app/common';
import { MaintenanceService } from './maintenance.service';

@Controller()
export class MaintenanceController {
  constructor(private readonly maintenance: MaintenanceService) {}

  @MessagePattern(PATTERNS.maintenance.list)
  list(@Payload() request: ListTicketsRequest): Promise<MaintenanceTicketDto[]> {
    return this.maintenance.list(request ?? {});
  }

  @MessagePattern(PATTERNS.maintenance.create)
  create(@Payload() request: CreateTicketRequest): Promise<MaintenanceTicketDto> {
    return this.maintenance.create(request);
  }

  @MessagePattern(PATTERNS.maintenance.update)
  update(@Payload() request: UpdateTicketRequest): Promise<MaintenanceTicketDto> {
    return this.maintenance.update(request);
  }
}
