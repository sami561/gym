import { Controller } from '@nestjs/common';
import { MessagePattern, Payload } from '@nestjs/microservices';
import {
  CreateWorkflowRequest,
  IdRequest,
  OkResult,
  PATTERNS,
  StartWorkflowRequest,
  UpdateWorkflowRequest,
  WorkflowDto,
  WorkflowRunDto,
} from '@app/common';
import { WorkflowEngine } from '../engine/workflow-engine.service';
import { WorkflowsService } from './workflows.service';

@Controller()
export class WorkflowsController {
  constructor(
    private readonly workflows: WorkflowsService,
    private readonly engine: WorkflowEngine,
  ) {}

  @MessagePattern(PATTERNS.workflows.list)
  list(@Payload() request?: { activeOnly?: boolean }): Promise<WorkflowDto[]> {
    return this.workflows.list(request ?? {});
  }

  @MessagePattern(PATTERNS.workflows.get)
  get(@Payload() request: IdRequest): Promise<WorkflowDto> {
    return this.workflows.get(request?.id);
  }

  @MessagePattern(PATTERNS.workflows.create)
  create(@Payload() request: CreateWorkflowRequest): Promise<WorkflowDto> {
    return this.workflows.create(request);
  }

  @MessagePattern(PATTERNS.workflows.update)
  update(@Payload() request: UpdateWorkflowRequest): Promise<WorkflowDto> {
    return this.workflows.update({ id: request?.id, data: request?.data ?? {} });
  }

  @MessagePattern(PATTERNS.workflows.remove)
  remove(@Payload() request: IdRequest): Promise<OkResult> {
    return this.workflows.remove(request?.id);
  }

  @MessagePattern(PATTERNS.workflows.start)
  start(@Payload() request: StartWorkflowRequest): Promise<WorkflowRunDto> {
    return this.engine.start(request);
  }
}
