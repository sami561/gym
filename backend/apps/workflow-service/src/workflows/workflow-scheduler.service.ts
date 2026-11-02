import { Injectable, Logger } from '@nestjs/common';
import { SchedulerRegistry } from '@nestjs/schedule';
import { CronJob } from 'cron';
import { WorkflowTriggerType } from '@app/common';
import { WorkflowEngine } from '../engine/workflow-engine.service';
import { Workflow } from './workflow.entity';

const jobName = (workflowId: string) => `workflow:${workflowId}`;

/**
 * Cron jobs of SCHEDULE workflows, in the gym timezone. One job per workflow,
 * re-registered whenever the workflow changes. Assumes a single workflow-service
 * instance (several replicas would each fire the schedule).
 */
@Injectable()
export class WorkflowScheduler {
  private readonly logger = new Logger(WorkflowScheduler.name);

  constructor(
    private readonly registry: SchedulerRegistry,
    private readonly engine: WorkflowEngine,
  ) {}

  sync(workflow: Workflow): void {
    this.unregister(workflow.id);
    const cron = workflow.trigger?.cron;
    if (!workflow.isActive || workflow.trigger?.type !== WorkflowTriggerType.SCHEDULE || !cron) return;
    const job = CronJob.from({
      cronTime: cron,
      onTick: () => void this.fire(workflow.id),
      start: false,
      timeZone: process.env.TZ || 'Africa/Tunis',
    });
    this.registry.addCronJob(jobName(workflow.id), job);
    job.start();
    this.logger.log(`"${workflow.name}" scheduled (${cron})`);
  }

  unregister(workflowId: string): void {
    const name = jobName(workflowId);
    if (this.registry.doesExist('cron', name)) this.registry.deleteCronJob(name);
  }

  private async fire(workflowId: string): Promise<void> {
    try {
      await this.engine.start({ workflowId, context: { scheduledAt: new Date().toISOString() } }, 'Planification');
    } catch (err) {
      this.logger.error(`Scheduled run of ${workflowId} failed: ${(err as Error).message}`);
    }
  }
}
