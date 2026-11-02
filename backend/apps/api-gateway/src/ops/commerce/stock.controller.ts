import { Body, Controller, Get, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { AuthUser, CurrentUser, PATTERNS, Role, Roles, RpcClient, StockMovementDto, toActor } from '@app/common';
import { CreateStockMovementDto, ListStockMovementsQuery } from './commerce.dto';

@ApiTags('Boutique — stock')
@ApiBearerAuth()
@Roles(Role.ADMIN, Role.STAFF)
@Controller('stock')
export class StockController {
  constructor(private readonly rpc: RpcClient) {}

  @Post('movements')
  move(@CurrentUser() user: AuthUser, @Body() dto: CreateStockMovementDto) {
    return this.rpc.send<StockMovementDto>(PATTERNS.stock.move, { ...dto, actor: toActor(user) });
  }

  @Get('movements')
  movements(@Query() q: ListStockMovementsQuery) {
    return this.rpc.send<StockMovementDto[]>(PATTERNS.stock.movements, q);
  }
}
