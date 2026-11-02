import { Controller } from '@nestjs/common';
import { MessagePattern, Payload } from '@nestjs/microservices';
import { CheckPromoRequest, CreatePromoRequest, IdRequest, PATTERNS, UpdatePromoRequest } from '@app/common';
import { PromosService } from './promos.service';

@Controller()
export class PromosController {
  constructor(private readonly promos: PromosService) {}

  @MessagePattern(PATTERNS.promos.list)
  list() {
    return this.promos.list();
  }

  @MessagePattern(PATTERNS.promos.create)
  create(@Payload() req: CreatePromoRequest) {
    return this.promos.create(req);
  }

  @MessagePattern(PATTERNS.promos.update)
  update(@Payload() req: UpdatePromoRequest) {
    return this.promos.update(req);
  }

  @MessagePattern(PATTERNS.promos.remove)
  remove(@Payload() req: IdRequest) {
    return this.promos.remove(req.id);
  }

  @MessagePattern(PATTERNS.promos.check)
  check(@Payload() req: CheckPromoRequest) {
    return this.promos.check(req);
  }
}
