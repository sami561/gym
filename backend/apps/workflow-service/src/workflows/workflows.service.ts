import { Injectable, Logger, NotFoundException, OnApplicationBootstrap } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import {
  CreateWorkflowRequest,
  OkResult,
  UpdateWorkflowRequest,
  WorkflowDto,
  WorkflowTriggerType,
} from '@app/common';
import { WorkflowEngine } from '../engine/workflow-engine.service';
import { assertUuid } from '../engine/task-rules';
import { toWorkflowDto } from '../mappers';
import { DEFAULT_WORKFLOWS } from './workflow-templates';
import { normalizeWorkflow } from './workflow-validation';
import { WorkflowScheduler } from './workflow-scheduler.service';
import { Workflow } from './workflow.entity';

@Injectable()
export class WorkflowsService implements OnApplicationBootstrap {
  private readonly logger = new Logger(WorkflowsService.name);

  constructor(
    @InjectRepository(Workflow) private readonly workflows: Repository<Workflow>,
    private readonly scheduler: WorkflowScheduler,
    private readonly engine: WorkflowEngine,
  ) {}

  /** First boot: create Meliora's default workflows, then register every schedule. */
  async onApplicationBootstrap(): Promise<void> {
    if ((await this.workflows.count()) === 0) {
      for (const template of DEFAULT_WORKFLOWS) {
        await this.workflows.save(this.workflows.create({ ...normalizeWorkflow(template), runCount: 0 }));
      }
      this.logger.log(`Seeded ${DEFAULT_WORKFLOWS.length} default workflows`);
    }
    (await this.workflows.find()).forEach((workflow) => this.scheduler.sync(workflow));
  }

  async list(request?: { activeOnly?: boolean }): Promise<WorkflowDto[]> {
    const workflows = await this.workflows.find({
      where: request?.activeOnly ? { isActive: true } : {},
      order: { name: 'ASC' },
    });
    return workflows.map(toWorkflowDto);
  }

  async get(id: string): Promise<WorkflowDto> {
    return toWorkflowDto(await this.find(id));
  }

  async create(request: CreateWorkflowRequest): Promise<WorkflowDto> {
    const saved = await this.workflows.save(this.workflows.create({ ...normalizeWorkflow(request), runCount: 0 }));
    this.scheduler.sync(saved);
    return toWorkflowDto(saved);
  }

  /** Runs already started keep their own copy of the tasks; only future runs see the change. */
  async update({ id, data = {} }: UpdateWorkflowRequest): Promise<WorkflowDto> {
    const workflow = await this.find(id);
    const merged = normalizeWorkflow({
      name: data.name ?? workflow.name,
      description: data.description !== undefined ? data.description : workflow.description,
      titleTemplate: data.titleTemplate !== undefined ? data.titleTemplate : workflow.titleTemplate,
      trigger: data.trigger ?? workflow.trigger,
      isActive: data.isActive ?? workflow.isActive,
      tasks: data.tasks ?? workflow.tasks,
    });
    Object.assign(workflow, merged);
    const saved = await this.workflows.save(workflow);
    this.scheduler.sync(saved);
    return toWorkflowDto(saved);
  }

  /** Past and running executions are kept (they store the workflow name). */
  async remove(id: string): Promise<OkResult> {
    const workflow = await this.find(id);
    await this.workflows.delete({ id: workflow.id });
    this.scheduler.unregister(workflow.id);
    return { ok: true };
  }

  /** Starts every active workflow listening to `event`; one failing workflow does not stop the others. */
  async triggerEvent(event: string, payload: Record<string, unknown>): Promise<void> {
    const workflows = await this.workflows
      .createQueryBuilder('w')
      .where('"w"."isActive" = true')
      .andWhere(`"w"."trigger"->>'type' = :type`, { type: WorkflowTriggerType.EVENT })
      .andWhere(`"w"."trigger"->>'event' = :event`, { event })
      .getMany();
    for (const workflow of workflows) {
      try {
        const run = await this.engine.start({ workflowId: workflow.id, context: payload }, `Automatique (${event})`);
        this.logger.log(`${event} → "${run.title}"`);
      } catch (err) {
        this.logger.error(`${event} could not start "${workflow.name}": ${(err as Error).message}`);
      }
    }
  }

  private async find(id: string): Promise<Workflow> {
    const workflow = await this.workflows.findOne({ where: { id: assertUuid(id, 'Workflow introuvable.') } });
    if (!workflow) throw new NotFoundException('Workflow introuvable.');
    return workflow;
  }
}
