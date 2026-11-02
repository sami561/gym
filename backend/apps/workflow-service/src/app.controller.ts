import { Controller } from '@nestjs/common';
import { MessagePattern } from '@nestjs/microservices';
import { HealthResult, PATTERNS, WorkflowStats, healthResult } from '@app/common';
import { TasksService } from './tasks/tasks.service';

@Controller()
export class AppController {
  constructor(private readonly tasks: TasksService) {}

  @MessagePattern(PATTERNS.workflowStats.health)
  health(): HealthResult {
    return healthResult('workflow-service');
  }

  @MessagePattern(PATTERNS.workflowStats.summary)
  stats(): Promise<WorkflowStats> {
    return this.tasks.stats();
  }
}
