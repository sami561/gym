import { Body, Controller, Delete, Get, Param, ParseUUIDPipe, Patch, Post, Put, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import {
  AccessLogDto,
  AuthUser,
  CreateMemberResult,
  CurrentUser,
  MemberAccessInfo,
  MemberDetail,
  MemberDto,
  MemberListItem,
  MemberProfile,
  Paginated,
  PATTERNS,
  PaymentDto,
  Role,
  Roles,
  RpcClient,
  SubscriptionDto,
  toActor,
} from '@app/common';
import {
  CardDto,
  CreateMemberDto,
  CreatePaymentDto,
  CreateSubscriptionDto,
  ListMembersQuery,
  UpdateMemberDto,
} from './members.dto';

@ApiTags('Membres')
@ApiBearerAuth()
@Roles(Role.ADMIN, Role.STAFF)
@Controller('members')
export class MembersController {
  constructor(private readonly rpc: RpcClient) {}

  @Get()
  list(@Query() q: ListMembersQuery) {
    return this.rpc.send<Paginated<MemberListItem>>(PATTERNS.members.list, q);
  }

  @Post()
  create(@CurrentUser() user: AuthUser, @Body() dto: CreateMemberDto) {
    return this.rpc.send<CreateMemberResult>(PATTERNS.members.create, { ...dto, actor: toActor(user) });
  }

  /** Profile + subscriptions + payments (membership) composed with badge and visits (access). */
  @Get(':id')
  async detail(@Param('id', ParseUUIDPipe) id: string): Promise<MemberDetail> {
    const [profile, access, visits] = await Promise.all([
      this.rpc.send<MemberProfile>(PATTERNS.members.profile, { id }),
      this.rpc.send<MemberAccessInfo>(PATTERNS.access.memberInfo, { memberId: id }),
      this.rpc.send<AccessLogDto[]>(PATTERNS.access.logs, { memberId: id, limit: 20 }),
    ]);
    return { ...profile, access, visits };
  }

  @Patch(':id')
  update(@Param('id', ParseUUIDPipe) id: string, @Body() dto: UpdateMemberDto) {
    return this.rpc.send<MemberDto>(PATTERNS.members.update, { id, data: dto });
  }

  @Roles(Role.ADMIN)
  @Delete(':id')
  remove(@Param('id', ParseUUIDPipe) id: string) {
    return this.rpc.send<{ ok: true }>(PATTERNS.members.remove, { id });
  }

  @Post(':id/subscriptions')
  subscribe(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: CreateSubscriptionDto,
  ) {
    return this.rpc.send<SubscriptionDto>(PATTERNS.subscriptions.create, {
      ...dto,
      memberId: id,
      actor: toActor(user),
    });
  }

  @Post(':id/payments')
  pay(@CurrentUser() user: AuthUser, @Param('id', ParseUUIDPipe) id: string, @Body() dto: CreatePaymentDto) {
    return this.rpc.send<PaymentDto>(PATTERNS.payments.create, { ...dto, memberId: id, actor: toActor(user) });
  }

  @Put(':id/card')
  setCard(@Param('id', ParseUUIDPipe) id: string, @Body() dto: CardDto) {
    return this.rpc.send<MemberAccessInfo>(PATTERNS.access.setCard, {
      memberId: id,
      cardNumber: dto.cardNumber?.trim() || null,
    });
  }
}
