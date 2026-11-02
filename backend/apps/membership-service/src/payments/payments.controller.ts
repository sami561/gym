import { Controller } from '@nestjs/common';
import { MessagePattern, Payload } from '@nestjs/microservices';
import { CreatePaymentRequest, ListPaymentsRequest, PATTERNS } from '@app/common';
import { PaymentsService } from './payments.service';

@Controller()
export class PaymentsController {
  constructor(private readonly payments: PaymentsService) {}

  @MessagePattern(PATTERNS.payments.create)
  create(@Payload() req: CreatePaymentRequest) {
    return this.payments.create(req);
  }

  @MessagePattern(PATTERNS.payments.list)
  list(@Payload() req: ListPaymentsRequest) {
    return this.payments.list(req ?? {});
  }
}
