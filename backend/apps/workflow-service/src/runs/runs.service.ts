import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { FindOptionsWhere, Repository } from 'typeorm';
import { GetRunRequest, ListRunsRequest, WorkflowRunDto, WorkflowRunStatus } from '@app/common';
import { FINISHED_STATUSES, assertUuid, runForViewer } from '../engine/task-rules';
import { toRunDto } from '../mappers';
import { Task } from '../tasks/task.entity';
import { WorkflowRun } from './workflow-run.entity';

@Injectable()
export class RunsService {
  constructor(
    @InjectRepository(WorkflowRun) private readonly runs: Repository<WorkflowRun>,
    @InjectRepository(Task) private readonly tasks: Repository<Task>,
  ) {}

  async list(request: ListRunsRequest): Promise<WorkflowRunDto[]> {
    const where: FindOptionsWhere<WorkflowRun> = {};
    if (request.workflowId) where.workflowId = assertUuid(request.workflowId, 'Workflow introuvable.');
    if (request.status) {
      if (!Object.values(WorkflowRunStatus).includes(request.status)) {
        throw new BadRequestException("Statut d'exécution inconnu.");
      }
      where.status = request.status;
    }
    const limit = Math.min(Math.max(Math.trunc(Number(request.limit) || 50), 1), 200);
    const runs = await this.runs.find({ where, order: { startedAt: 'DESC' }, take: limit });
    const progress = await this.progressOf(runs.map((run) => run.id));
    return runs.map((run) => toRunDto(run, undefined, progress.get(run.id)));
  }

  /** A coach (`forUser`) only gets the run through one of its tasks they can see. */
  async get({ id, forUser }: GetRunRequest): Promise<WorkflowRunDto> {
    const run = await this.runs.findOne({ where: { id: assertUuid(id, 'Exécution introuvable.') } });
    if (!run) throw new NotFoundException('Exécution introuvable.');
    const tasks = await this.tasks.find({ where: { runId: run.id }, order: { sortOrder: 'ASC', createdAt: 'ASC' } });
    const dto = runForViewer(toRunDto(run, tasks), forUser);
    if (!dto) throw new NotFoundException('Exécution introuvable.');
    return dto;
  }

  private async progressOf(runIds: string[]): Promise<Map<string, { done: number; total: number }>> {
    if (!runIds.length) return new Map();
    const rows = await this.tasks
      .createQueryBuilder('t')
      .select('"t"."runId"', 'runId')
      .addSelect('COUNT(*)', 'total')
      .addSelect('COUNT(*) FILTER (WHERE "t"."status" IN (:...finished))', 'done')
      .where('"t"."runId" IN (:...runIds)', { runIds, finished: FINISHED_STATUSES })
      .groupBy('"t"."runId"')
      .getRawMany<{ runId: string; total: string; done: string }>();
    return new Map(rows.map((row) => [row.runId, { done: Number(row.done), total: Number(row.total) }]));
  }
}
