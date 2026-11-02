import { Body, Controller, Delete, Get, Param, ParseUUIDPipe, Patch, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { PATTERNS, Role, Roles, RpcClient, UserDto } from '@app/common';
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
}
