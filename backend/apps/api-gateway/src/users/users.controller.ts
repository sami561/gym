import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Put,
  Query,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { IdRequest, PATTERNS, Role, Roles, RpcClient, SetPhotoRequest, UserDto } from '@app/common';
import { ApiPhotoUpload, PhotoUploadInterceptor, UploadedPhoto, photoData } from '../common/photo';
import { CreateUserDto, ListUsersQuery, UpdateUserDto } from './users.dto';

@ApiTags('Équipe (comptes)')
@ApiBearerAuth()
@Roles(Role.ADMIN)
@Controller('users')
export class UsersController {
  constructor(private readonly rpc: RpcClient) {}

  /** Staff can list coaches (class planning); everything else is ADMIN only. */
  @Roles(Role.ADMIN, Role.STAFF)
  @Get()
  list(@Query() q: ListUsersQuery) {
    return this.rpc.send<UserDto[]>(PATTERNS.users.list, q);
  }

  @Post()
  create(@Body() dto: CreateUserDto) {
    return this.rpc.send<UserDto>(PATTERNS.users.create, dto);
  }

  @Patch(':id')
  update(@Param('id', ParseUUIDPipe) id: string, @Body() dto: UpdateUserDto) {
    return this.rpc.send<UserDto>(PATTERNS.users.update, { id, data: dto });
  }

  @Delete(':id')
  remove(@Param('id', ParseUUIDPipe) id: string) {
    return this.rpc.send<{ ok: true }>(PATTERNS.users.remove, { id });
  }

  /**
   * Coach photo for the website (docs/API.md, Coach photos): multipart/form-data, file field `photo`, a JPEG of
   * at most 512 KB. avatarUrl then points to GET /api/public/coaches/:id/photo?v=…; 400 for another role.
   */
  @ApiPhotoUpload()
  @UseInterceptors(PhotoUploadInterceptor)
  @Put(':id/photo')
  setPhoto(@Param('id', ParseUUIDPipe) id: string, @UploadedFile() file: UploadedPhoto | undefined) {
    return this.rpc.send<UserDto, SetPhotoRequest>(PATTERNS.users.photoSet, { id, data: photoData(file) });
  }

  /** Deletes the uploaded photo and clears avatarUrl (also when there was no photo). */
  @Delete(':id/photo')
  removePhoto(@Param('id', ParseUUIDPipe) id: string) {
    return this.rpc.send<UserDto, IdRequest>(PATTERNS.users.photoRemove, { id });
  }
}
