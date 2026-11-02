import { Controller } from '@nestjs/common';
import { MessagePattern, Payload } from '@nestjs/microservices';
import { CreateSaleRequest, ListSalesRequest, PATTERNS, RefundSaleRequest, SaleDto, SalesPage } from '@app/common';
import { SalesService } from './sales.service';

@Controller()
export class SalesController {
  constructor(private readonly sales: SalesService) {}

  @MessagePattern(PATTERNS.sales.create)
  create(@Payload() request: CreateSaleRequest): Promise<SaleDto> {
    return this.sales.create(request);
  }

  @MessagePattern(PATTERNS.sales.list)
  list(@Payload() request: ListSalesRequest): Promise<SalesPage> {
    return this.sales.list(request ?? {});
  }

  @MessagePattern(PATTERNS.sales.refund)
  refund(@Payload() request: RefundSaleRequest): Promise<SaleDto> {
    return this.sales.refund(request);
  }
}
