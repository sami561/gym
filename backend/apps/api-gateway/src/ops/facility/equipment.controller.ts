import { Body, Controller, Delete, Get, Param, ParseUUIDPipe, Patch, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { EquipmentDto, PATTERNS, Role, Roles, RpcClient } from '@app/common';
import { CreateEquipmentDto, ListEquipmentQuery, UpdateEquipmentDto } from './facility.dto';

@ApiTags('Équipements')
@ApiBearerAuth()
@Roles(Role.ADMIN, Role.STAFF)
@Controller('equipment')
export class EquipmentController {
  constructor(private readonly rpc: RpcClient) {}

  @Get()
  list(@Query() q: ListEquipmentQuery) {
    return this.rpc.send<EquipmentDto[]>(PATTERNS.equipment.list, q);
  }

  @Post()
  create(@Body() dto: CreateEquipmentDto) {
    return this.rpc.send<EquipmentDto>(PATTERNS.equipment.create, dto);
  }

  @Get(':id')
  get(@Param('id', ParseUUIDPipe) id: string) {
    return this.rpc.send<EquipmentDto>(PATTERNS.equipment.get, { id });
  }

  @Patch(':id')
  update(@Param('id', ParseUUIDPipe) id: string, @Body() dto: UpdateEquipmentDto) {
    return this.rpc.send<EquipmentDto>(PATTERNS.equipment.update, { id, data: dto });
  }

  @Delete(':id')
  remove(@Param('id', ParseUUIDPipe) id: string) {
    return this.rpc.send<{ ok: true }>(PATTERNS.equipment.remove, { id });
  }
}
