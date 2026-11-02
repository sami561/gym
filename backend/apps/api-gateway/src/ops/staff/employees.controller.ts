import { Body, Controller, Delete, Get, Param, ParseUUIDPipe, Patch, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { EmployeeDto, PATTERNS, Role, Roles, RpcClient } from '@app/common';
import { CreateEmployeeDto, ListEmployeesQuery, UpdateEmployeeDto } from './staff.dto';

@ApiTags('Employés')
@ApiBearerAuth()
@Roles(Role.ADMIN, Role.STAFF)
@Controller('employees')
export class EmployeesController {
  constructor(private readonly rpc: RpcClient) {}

  @Get()
  list(@Query() q: ListEmployeesQuery) {
    return this.rpc.send<EmployeeDto[]>(PATTERNS.employees.list, q);
  }

  @Post()
  create(@Body() dto: CreateEmployeeDto) {
    return this.rpc.send<EmployeeDto>(PATTERNS.employees.create, dto);
  }

  @Get(':id')
  get(@Param('id', ParseUUIDPipe) id: string) {
    return this.rpc.send<EmployeeDto>(PATTERNS.employees.get, { id });
  }

  @Patch(':id')
  update(@Param('id', ParseUUIDPipe) id: string, @Body() dto: UpdateEmployeeDto) {
    return this.rpc.send<EmployeeDto>(PATTERNS.employees.update, { id, data: dto });
  }

  @Delete(':id')
  remove(@Param('id', ParseUUIDPipe) id: string) {
    return this.rpc.send<{ ok: true }>(PATTERNS.employees.remove, { id });
  }
}
