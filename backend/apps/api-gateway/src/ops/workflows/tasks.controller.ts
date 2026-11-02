import { Body, Controller, Delete, Get, Param, ParseUUIDPipe, Patch, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import {
  AuthUser,
  CreateTaskRequest,
  CurrentUser,
  ListTasksRequest,
  PATTERNS,
  RetryTaskRequest,
  Role,
  Roles,
  RpcClient,
  TaskDto,
  UpdateTaskRequest,
  toActor,
} from '@app/common';
import { taskViewer } from './task-viewer';
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
    const forUser = mine ? { role: user.role } : taskViewer(user);
    const request: ListTasksRequest = forUser ? { ...filters, forUser } : filters;
    return this.rpc.send<TaskDto[]>(PATTERNS.tasks.list, request);
  }

  // Every other route applies the same scope: for a coach, a task they cannot see is a 404.

  /** Ad-hoc task, optionally linked to the tasks it depends on. */
  @Post()
  create(@CurrentUser() user: AuthUser, @Body() dto: CreateTaskDto) {
    return this.rpc.send<TaskDto, CreateTaskRequest>(PATTERNS.tasks.create, {
      ...dto,
      actor: toActor(user),
      forUser: taskViewer(user),
    });
  }

  @Patch(':id')
  update(@CurrentUser() user: AuthUser, @Param('id', ParseUUIDPipe) id: string, @Body() dto: UpdateTaskDto) {
    return this.rpc.send<TaskDto, UpdateTaskRequest>(PATTERNS.tasks.update, {
      id,
      data: dto,
      actor: toActor(user),
      forUser: taskViewer(user),
    });
  }

  /** Re-runs a FAILED automation task. */
  @Roles(Role.ADMIN, Role.STAFF)
  @Post(':id/retry')
  retry(@CurrentUser() user: AuthUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.rpc.send<TaskDto, RetryTaskRequest>(PATTERNS.tasks.retry, {
      id,
      actor: toActor(user),
      forUser: taskViewer(user),
    });
  }

  @Roles(Role.ADMIN)
  @Delete(':id')
  remove(@Param('id', ParseUUIDPipe) id: string) {
    return this.rpc.send<{ ok: true }>(PATTERNS.tasks.remove, { id });
  }
}
