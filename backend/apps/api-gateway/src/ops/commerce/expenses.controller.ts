import { Body, Controller, Delete, Get, Param, ParseUUIDPipe, Patch, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { AuthUser, CurrentUser, ExpenseDto, PATTERNS, Role, Roles, RpcClient, toActor } from '@app/common';
import { CreateExpenseDto, ListExpensesQuery, UpdateExpenseDto } from './commerce.dto';

@ApiTags('Dépenses')
@ApiBearerAuth()
@Roles(Role.ADMIN)
@Controller('expenses')
export class ExpensesController {
  constructor(private readonly rpc: RpcClient) {}

  @Get()
  list(@Query() q: ListExpensesQuery) {
    return this.rpc.send<ExpenseDto[]>(PATTERNS.expenses.list, q);
  }

  @Post()
  create(@CurrentUser() user: AuthUser, @Body() dto: CreateExpenseDto) {
    return this.rpc.send<ExpenseDto>(PATTERNS.expenses.create, { ...dto, actor: toActor(user) });
  }

  @Patch(':id')
  update(@Param('id', ParseUUIDPipe) id: string, @Body() dto: UpdateExpenseDto) {
    return this.rpc.send<ExpenseDto>(PATTERNS.expenses.update, { id, data: dto });
  }

  @Delete(':id')
  remove(@Param('id', ParseUUIDPipe) id: string) {
    return this.rpc.send<{ ok: true }>(PATTERNS.expenses.remove, { id });
  }
}
