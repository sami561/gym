import { Controller } from '@nestjs/common';
import { MessagePattern, Payload } from '@nestjs/microservices';
import {
  Actor,
  CreateTaskRequest,
  IdRequest,
  ListTasksRequest,
  OkResult,
  PATTERNS,
  TaskDto,
  UpdateTaskRequest,
} from '@app/common';
import { WorkflowEngine } from '../engine/workflow-engine.service';
import { TasksService } from './tasks.service';

@Controller()
export class TasksController {
  constructor(
    private readonly tasks: TasksService,
    private readonly engine: WorkflowEngine,
  ) {}

  @MessagePattern(PATTERNS.tasks.list)
  list(@Payload() request?: ListTasksRequest): Promise<TaskDto[]> {
    return this.tasks.list(request ?? {});
  }

  @MessagePattern(PATTERNS.tasks.create)
  create(@Payload() request: CreateTaskRequest): Promise<TaskDto> {
    return this.engine.createTask(request);
  }

  @MessagePattern(PATTERNS.tasks.update)
  update(@Payload() request: UpdateTaskRequest): Promise<TaskDto> {
    return this.engine.updateTask(request);
  }

  @MessagePattern(PATTERNS.tasks.retry)
  retry(@Payload() request: IdRequest & { actor?: Actor }): Promise<TaskDto> {
    return this.engine.retry(request);
  }

  @MessagePattern(PATTERNS.tasks.remove)
  remove(@Payload() request: IdRequest): Promise<OkResult> {
    return this.engine.removeTask(request);
  }
}
