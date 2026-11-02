import { Module } from '@nestjs/common';
import { ScheduleModule } from '@nestjs/schedule';
import { TypeOrmModule } from '@nestjs/typeorm';
import { BusModule, databaseModule } from '@app/common';
import { AppController } from './app.controller';
import { AutomationRunner } from './engine/automation-runner';
import { WorkflowEngine } from './engine/workflow-engine.service';
import { RunsController } from './runs/runs.controller';
import { RunsService } from './runs/runs.service';
import { WorkflowRun } from './runs/workflow-run.entity';
import { Task } from './tasks/task.entity';
import { TasksController } from './tasks/tasks.controller';
import { TasksService } from './tasks/tasks.service';
import { WorkflowScheduler } from './workflows/workflow-scheduler.service';
import { WorkflowTriggersController } from './workflows/workflow-triggers.controller';
import { Workflow } from './workflows/workflow.entity';
import { WorkflowsController } from './workflows/workflows.controller';
import { WorkflowsService } from './workflows/workflows.service';

@Module({
  imports: [
    databaseModule('workflow'),
    TypeOrmModule.forFeature([Workflow, WorkflowRun, Task]),
    BusModule.forRoot(),
    ScheduleModule.forRoot(),
  ],
  controllers: [AppController, WorkflowsController, WorkflowTriggersController, RunsController, TasksController],
  providers: [WorkflowsService, WorkflowScheduler, WorkflowEngine, AutomationRunner, RunsService, TasksService],
})
export class AppModule {}
