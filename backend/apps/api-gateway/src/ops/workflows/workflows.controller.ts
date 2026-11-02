import { Body, Controller, Delete, Get, Param, ParseUUIDPipe, Patch, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import {
  AuthUser,
  CurrentUser,
  PATTERNS,
  Role,
  Roles,
  RpcClient,
  TRIGGERABLE_EVENTS,
  WorkflowDto,
  WorkflowRunDto,
  toActor,
} from '@app/common';
import { CreateWorkflowDto, ListWorkflowsQuery, StartWorkflowDto, UpdateWorkflowDto } from './workflows.dto';

@ApiTags('Workflows')
@ApiBearerAuth()
@Roles(Role.ADMIN, Role.STAFF)
@Controller('workflows')
export class WorkflowsController {
  constructor(private readonly rpc: RpcClient) {}

  @Get()
  list(@Query() q: ListWorkflowsQuery) {
    return this.rpc.send<WorkflowDto[]>(PATTERNS.workflows.list, q);
  }

  /** Dropdown values of the editor. Declared before ':id' so "meta" is not parsed as an id. */
  @Get('meta')
  meta() {
    return { events: [...TRIGGERABLE_EVENTS], roles: Object.values(Role) };
  }

  @Roles(Role.ADMIN)
  @Post()
  create(@Body() dto: CreateWorkflowDto) {
    return this.rpc.send<WorkflowDto>(PATTERNS.workflows.create, dto);
  }

  @Get(':id')
  get(@Param('id', ParseUUIDPipe) id: string) {
    return this.rpc.send<WorkflowDto>(PATTERNS.workflows.get, { id });
  }

  @Roles(Role.ADMIN)
  @Patch(':id')
  update(@Param('id', ParseUUIDPipe) id: string, @Body() dto: UpdateWorkflowDto) {
    return this.rpc.send<WorkflowDto>(PATTERNS.workflows.update, { id, data: dto });
  }

  @Roles(Role.ADMIN)
  @Delete(':id')
  remove(@Param('id', ParseUUIDPipe) id: string) {
    return this.rpc.send<{ ok: true }>(PATTERNS.workflows.remove, { id });
  }

  @Post(':id/start')
  start(@CurrentUser() user: AuthUser, @Param('id', ParseUUIDPipe) id: string, @Body() dto: StartWorkflowDto) {
    return this.rpc.send<WorkflowRunDto>(PATTERNS.workflows.start, {
      workflowId: id,
      context: dto.context,
      title: dto.title,
      actor: toActor(user),
    });
  }
}
