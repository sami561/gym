import { Controller } from '@nestjs/common';
import { MessagePattern, Payload } from '@nestjs/microservices';
import { Actor, IdRequest, ListRunsRequest, PATTERNS, WorkflowRunDto } from '@app/common';
import { WorkflowEngine } from '../engine/workflow-engine.service';
import { RunsService } from './runs.service';

@Controller()
export class RunsController {
  constructor(
    private readonly runs: RunsService,
    private readonly engine: WorkflowEngine,
  ) {}

  @MessagePattern(PATTERNS.workflowRuns.list)
  list(@Payload() request?: ListRunsRequest): Promise<WorkflowRunDto[]> {
    return this.runs.list(request ?? {});
  }

  @MessagePattern(PATTERNS.workflowRuns.get)
  get(@Payload() request: IdRequest): Promise<WorkflowRunDto> {
    return this.runs.get(request?.id);
  }

  @MessagePattern(PATTERNS.workflowRuns.cancel)
  cancel(@Payload() request: IdRequest & { actor?: Actor }): Promise<WorkflowRunDto> {
    return this.engine.cancelRun(request);
  }
}
