import { Body, Controller, Param, ParseUUIDPipe, Patch, Post } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { PATTERNS, Role, Roles, RpcClient, SubscriptionDto } from '@app/common';
import { FreezeDto, UpdateSubscriptionDto } from './members.dto';

@ApiTags('Abonnements')
@ApiBearerAuth()
@Roles(Role.ADMIN, Role.STAFF)
@Controller('subscriptions')
export class SubscriptionsController {
  constructor(private readonly rpc: RpcClient) {}

  @Patch(':id')
  update(@Param('id', ParseUUIDPipe) id: string, @Body() dto: UpdateSubscriptionDto) {
    return this.rpc.send<SubscriptionDto>(PATTERNS.subscriptions.update, { id, ...dto });
  }

  @Post(':id/freeze')
  freeze(@Param('id', ParseUUIDPipe) id: string, @Body() dto: FreezeDto) {
    return this.rpc.send<SubscriptionDto>(PATTERNS.subscriptions.freeze, { id, ...dto });
  }

  @Post(':id/unfreeze')
  unfreeze(@Param('id', ParseUUIDPipe) id: string) {
    return this.rpc.send<SubscriptionDto>(PATTERNS.subscriptions.unfreeze, { id });
  }
}
