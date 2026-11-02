import { Controller } from '@nestjs/common';
import { MessagePattern, Payload } from '@nestjs/microservices';
import { CreatePlanRequest, IdRequest, ListPlansRequest, PATTERNS, UpdatePlanRequest } from '@app/common';
import { PlansService } from './plans.service';

@Controller()
export class PlansController {
  constructor(private readonly plans: PlansService) {}

  @MessagePattern(PATTERNS.plans.list)
  list(@Payload() req: ListPlansRequest) {
    return this.plans.list(req ?? {});
  }

  @MessagePattern(PATTERNS.plans.create)
  create(@Payload() req: CreatePlanRequest) {
    return this.plans.create(req);
  }

  @MessagePattern(PATTERNS.plans.update)
  update(@Payload() req: UpdatePlanRequest) {
    return this.plans.update(req);
  }

  @MessagePattern(PATTERNS.plans.remove)
  remove(@Payload() req: IdRequest) {
    return this.plans.remove(req.id);
  }
}
