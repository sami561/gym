import { Controller, Get, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { PATTERNS, PaymentsPage, Role, Roles, RpcClient } from '@app/common';
import { ListPaymentsQuery } from './members.dto';

@ApiTags('Paiements')
@ApiBearerAuth()
@Roles(Role.ADMIN, Role.STAFF)
@Controller('payments')
export class PaymentsController {
  constructor(private readonly rpc: RpcClient) {}

  @Get()
  list(@Query() q: ListPaymentsQuery) {
    return this.rpc.send<PaymentsPage>(PATTERNS.payments.list, q);
  }
}
