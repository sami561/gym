import {
  Body,
  Controller,
  Delete,
  Get,
  Headers,
  HttpCode,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Put,
  Query,
  Res,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import type { Response } from 'express';
import {
  ACCESS_ROTATE_KEY_PATTERN,
  AccessKeyRotation,
  AccessLogDto,
  AuthUser,
  CreateMemberResult,
  CurrentUser,
  IdRequest,
  MemberAccessInfo,
  MemberDetail,
  MemberDto,
  MemberListItem,
  MemberPhoto,
  MemberProfile,
  Paginated,
  PATTERNS,
  PaymentDto,
  Role,
  Roles,
  RotateAccessKeyRequest,
  RpcClient,
  SetMemberPhotoRequest,
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
import {
  ApiPhotoDownload,
  ApiPhotoUpload,
  PhotoUploadInterceptor,
  UploadedPhoto,
  photoData,
  sendPhoto,
} from './member-photo';

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

  /** JPEG without metadata (docs/API.md, Member photos); 404 'Aucune photo.' or 'Membre introuvable.'. */
  @ApiPhotoDownload()
  @Get(':id/photo')
  async photo(
    @Param('id', ParseUUIDPipe) id: string,
    @Query('v') version: string | undefined,
    @Headers('if-none-match') ifNoneMatch: string | undefined,
    @Res() res: Response,
  ): Promise<void> {
    const photo = await this.rpc.send<MemberPhoto, IdRequest>(PATTERNS.members.photoGet, { id });
    sendPhoto(res, photo, { version, ifNoneMatch });
  }

  /** multipart/form-data, file field `photo`: a JPEG of at most 512 KB. */
  @ApiPhotoUpload()
  @UseInterceptors(PhotoUploadInterceptor)
  @Put(':id/photo')
  setPhoto(@Param('id', ParseUUIDPipe) id: string, @UploadedFile() file: UploadedPhoto | undefined) {
    return this.rpc.send<MemberDto, SetMemberPhotoRequest>(PATTERNS.members.photoSet, { id, data: photoData(file) });
  }

  @Delete(':id/photo')
  removePhoto(@Param('id', ParseUUIDPipe) id: string) {
    return this.rpc.send<MemberDto, IdRequest>(PATTERNS.members.photoRemove, { id });
  }

  @Put(':id/card')
  setCard(@Param('id', ParseUUIDPipe) id: string, @Body() dto: CardDto) {
    return this.rpc.send<MemberAccessInfo>(PATTERNS.access.setCard, {
      memberId: id,
      cardNumber: dto.cardNumber?.trim() || null,
    });
  }

  /**
   * Lost or shared phone: the member's QR codes stop working at once. The secret is not returned;
   * the app gets the new one from GET /api/me/access-key.
   */
  @HttpCode(200)
  @Post(':id/access-key/rotate')
  async rotateAccessKey(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<{ ok: true; rotatedAt: string }> {
    const { rotatedAt } = await this.rpc.send<AccessKeyRotation, RotateAccessKeyRequest>(ACCESS_ROTATE_KEY_PATTERN, {
      memberId: id,
      actor: toActor(user),
    });
    return { ok: true, rotatedAt };
  }
}
