import { Controller, Get, Param, ParseUUIDPipe, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { AuthUser, CurrentUser, GetRunRequest, PATTERNS, Role, Roles, RpcClient, WorkflowRunDto, toActor } from '@app/common';
import { taskViewer } from './task-viewer';
import { ListRunsQuery } from './workflows.dto';

@ApiTags('Workflows — exécutions')
@ApiBearerAuth()
@Roles(Role.ADMIN, Role.STAFF)
@Controller('workflow-runs')
export class WorkflowRunsController {
  constructor(private readonly rpc: RpcClient) {}

  @Get()
  list(@Query() q: ListRunsQuery) {
    return this.rpc.send<WorkflowRunDto[]>(PATTERNS.workflowRuns.list, q);
  }

  /**
   * Run with its tasks. Coaches open it from a task they can see: they get only those tasks
   * and `context: null` (404 when none of its tasks is theirs).
   */
  @Roles(Role.ADMIN, Role.STAFF, Role.COACH)
  @Get(':id')
  get(@CurrentUser() user: AuthUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.rpc.send<WorkflowRunDto, GetRunRequest>(PATTERNS.workflowRuns.get, { id, forUser: taskViewer(user) });
  }

  @Post(':id/cancel')
  cancel(@CurrentUser() user: AuthUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.rpc.send<WorkflowRunDto>(PATTERNS.workflowRuns.cancel, { id, actor: toActor(user) });
  }
}
