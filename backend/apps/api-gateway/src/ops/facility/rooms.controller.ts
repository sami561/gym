import { Body, Controller, Delete, Get, Param, ParseUUIDPipe, Patch, Post } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { ListRoomsRequest, PATTERNS, Role, Roles, RoomDto, RpcClient } from '@app/common';
import { CreateRoomDto, UpdateRoomDto } from './facility.dto';

@ApiTags('Salles')
@ApiBearerAuth()
@Roles(Role.ADMIN, Role.STAFF)
@Controller('rooms')
export class RoomsController {
  constructor(private readonly rpc: RpcClient) {}

  /** Back-office list: inactive rooms included (the public website only gets active ones). */
  @Get()
  list() {
    return this.rpc.send<RoomDto[], ListRoomsRequest>(PATTERNS.rooms.list, { includeInactive: true });
  }

  @Post()
  create(@Body() dto: CreateRoomDto) {
    return this.rpc.send<RoomDto>(PATTERNS.rooms.create, dto);
  }

  @Patch(':id')
  update(@Param('id', ParseUUIDPipe) id: string, @Body() dto: UpdateRoomDto) {
    return this.rpc.send<RoomDto>(PATTERNS.rooms.update, { id, data: dto });
  }

  @Delete(':id')
  remove(@Param('id', ParseUUIDPipe) id: string) {
    return this.rpc.send<{ ok: true }>(PATTERNS.rooms.remove, { id });
  }
}
