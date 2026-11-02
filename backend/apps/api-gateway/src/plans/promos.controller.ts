import { Body, Controller, Delete, Get, HttpCode, Param, ParseUUIDPipe, Patch, Post } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { PATTERNS, PromoCodeDto, PromoQuote, Role, Roles, RpcClient } from '@app/common';
import { CheckPromoDto, CreatePromoDto, UpdatePromoDto } from './plans.dto';

@ApiTags('Codes promo')
@ApiBearerAuth()
@Roles(Role.ADMIN)
@Controller('promos')
export class PromosController {
  constructor(private readonly rpc: RpcClient) {}

  @Get()
  list() {
    return this.rpc.send<PromoCodeDto[]>(PATTERNS.promos.list, {});
  }

  @Post()
  create(@Body() dto: CreatePromoDto) {
    return this.rpc.send<PromoCodeDto>(PATTERNS.promos.create, dto);
  }

  /** Price quote for the subscription form (reception). */
  @Roles(Role.ADMIN, Role.STAFF)
  @HttpCode(200)
  @Post('check')
  check(@Body() dto: CheckPromoDto) {
    return this.rpc.send<PromoQuote>(PATTERNS.promos.check, dto);
  }

  @Patch(':id')
  update(@Param('id', ParseUUIDPipe) id: string, @Body() dto: UpdatePromoDto) {
    return this.rpc.send<PromoCodeDto>(PATTERNS.promos.update, { id, data: dto });
  }

  @Delete(':id')
  remove(@Param('id', ParseUUIDPipe) id: string) {
    return this.rpc.send<{ ok: true }>(PATTERNS.promos.remove, { id });
  }
}
