import { Body, Controller, Delete, Get, Param, ParseUUIDPipe, Patch, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { AuthUser, CurrentUser, ListTasksRequest, PATTERNS, Role, Roles, RpcClient, TaskDto, toActor } from '@app/common';
import { CreateTaskDto, ListTasksQuery, UpdateTaskDto } from './workflows.dto';

@ApiTags('Tâches')
@ApiBearerAuth()
@Roles(Role.ADMIN, Role.STAFF, Role.COACH)
@Controller('tasks')
export class TasksController {
  constructor(private readonly rpc: RpcClient) {}

  @Get()
  list(@CurrentUser() user: AuthUser, @Query() q: ListTasksQuery) {
    const { mine, ...filters } = q;
    // Coaches only ever see their own role's tasks (or unassigned ones); staff can opt in with ?mine=true.
    const scoped = mine || user.role === Role.COACH;
    const request: ListTasksRequest = scoped ? { ...filters, forUser: { role: user.role } } : filters;
    return this.rpc.send<TaskDto[]>(PATTERNS.tasks.list, request);
  }

  /** Ad-hoc task, optionally linked to the tasks it depends on. */
  @Post()
  create(@CurrentUser() user: AuthUser, @Body() dto: CreateTaskDto) {
    return this.rpc.send<TaskDto>(PATTERNS.tasks.create, { ...dto, actor: toActor(user) });
  }

  @Patch(':id')
  update(@CurrentUser() user: AuthUser, @Param('id', ParseUUIDPipe) id: string, @Body() dto: UpdateTaskDto) {
    return this.rpc.send<TaskDto>(PATTERNS.tasks.update, { id, data: dto, actor: toActor(user) });
  }

  /** Re-runs a FAILED automation task. */
  @Roles(Role.ADMIN, Role.STAFF)
  @Post(':id/retry')
  retry(@CurrentUser() user: AuthUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.rpc.send<TaskDto>(PATTERNS.tasks.retry, { id, actor: toActor(user) });
  }

  @Roles(Role.ADMIN)
  @Delete(':id')
  remove(@Param('id', ParseUUIDPipe) id: string) {
    return this.rpc.send<{ ok: true }>(PATTERNS.tasks.remove, { id });
  }
}
