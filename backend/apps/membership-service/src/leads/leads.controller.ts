import { Controller } from '@nestjs/common';
import { MessagePattern, Payload } from '@nestjs/microservices';
import {
  AddLeadActivityRequest,
  ConvertLeadRequest,
  CreateLeadRequest,
  IdRequest,
  ListLeadsRequest,
  PATTERNS,
  PublicTrialRequest,
  UpdateLeadRequest,
} from '@app/common';
import { LeadsService } from './leads.service';

@Controller()
export class LeadsController {
  constructor(private readonly leads: LeadsService) {}

  @MessagePattern(PATTERNS.leads.list)
  list(@Payload() req: ListLeadsRequest) {
    return this.leads.list(req ?? {});
  }

  @MessagePattern(PATTERNS.leads.get)
  get(@Payload() req: IdRequest) {
    return this.leads.get(req.id);
  }

  @MessagePattern(PATTERNS.leads.create)
  create(@Payload() req: CreateLeadRequest) {
    return this.leads.create(req);
  }

  @MessagePattern(PATTERNS.leads.publicTrial)
  publicTrial(@Payload() req: PublicTrialRequest) {
    return this.leads.publicTrial(req);
  }

  @MessagePattern(PATTERNS.leads.update)
  update(@Payload() req: UpdateLeadRequest) {
    return this.leads.update(req);
  }

  @MessagePattern(PATTERNS.leads.remove)
  remove(@Payload() req: IdRequest) {
    return this.leads.remove(req.id);
  }

  @MessagePattern(PATTERNS.leads.addActivity)
  addActivity(@Payload() req: AddLeadActivityRequest) {
    return this.leads.addActivity(req);
  }

  @MessagePattern(PATTERNS.leads.convert)
  convert(@Payload() req: ConvertLeadRequest) {
    return this.leads.convert(req);
  }

  @MessagePattern(PATTERNS.leads.stats)
  stats() {
    return this.leads.stats();
  }
}
