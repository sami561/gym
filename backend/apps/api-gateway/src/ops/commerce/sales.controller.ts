import { Body, Controller, Get, Param, ParseUUIDPipe, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import {
  AuthUser,
  CurrentUser,
  MemberDto,
  PATTERNS,
  Role,
  Roles,
  RpcClient,
  SaleDto,
  SalesPage,
  fullName,
  toActor,
} from '@app/common';
import { CreateSaleDto, ListSalesQuery } from './commerce.dto';

@ApiTags('Boutique — caisse')
@ApiBearerAuth()
@Roles(Role.ADMIN, Role.STAFF)
@Controller('sales')
export class SalesController {
  constructor(private readonly rpc: RpcClient) {}

  /** POS sale; when a member is given, their name and e-mail go on the receipt. */
  @Post()
  async create(@CurrentUser() user: AuthUser, @Body() dto: CreateSaleDto) {
    const member = dto.memberId
      ? await this.rpc.send<MemberDto>(PATTERNS.members.get, { id: dto.memberId })
      : null;
    return this.rpc.send<SaleDto>(PATTERNS.sales.create, {
      ...dto,
      memberName: member ? fullName(member) : null,
      memberEmail: member?.email ?? null,
      actor: toActor(user),
    });
  }

  @Get()
  list(@Query() q: ListSalesQuery) {
    return this.rpc.send<SalesPage>(PATTERNS.sales.list, q);
  }

  @Roles(Role.ADMIN)
  @Post(':id/refund')
  refund(@CurrentUser() user: AuthUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.rpc.send<SaleDto>(PATTERNS.sales.refund, { id, actor: toActor(user) });
  }
}
