import { NotFoundException } from '@nestjs/common';
import { Repository } from 'typeorm';
import { Role, TaskStatus, TaskType, WorkflowRunStatus } from '@app/common';
import { Task } from '../tasks/task.entity';
import { RunsService } from './runs.service';
import { WorkflowRun } from './workflow-run.entity';

const RUN_ID = '00000000-0000-4000-8000-000000000100';
const CONTEXT = { firstName: 'Amira', phone: '+216 20 000 000' };
const CREATED = new Date('2026-11-02T08:00:00.000Z');

/** A run whose tasks are assigned to `assignees` (null = unassigned), in that order. */
function service(assignees: (Role | null)[]): RunsService {
  const run = Object.assign(new WorkflowRun(), {
    id: RUN_ID,
    workflowId: '00000000-0000-4000-8000-000000000200',
    workflowName: 'Onboarding',
    title: 'Onboarding — Amira',
    status: WorkflowRunStatus.RUNNING,
    context: CONTEXT,
    startedByName: null,
    startedAt: CREATED,
    completedAt: null,
  });
  const tasks = assignees.map((assigneeRole, index) =>
    Object.assign(new Task(), {
      id: `00000000-0000-4000-8000-00000000000${index + 1}`,
      runId: RUN_ID,
      title: `Tâche ${index + 1}`,
      type: TaskType.MANUAL,
      status: index === 0 ? TaskStatus.DONE : TaskStatus.TODO,
      assigneeRole,
      assigneeEmployeeId: null,
      dependsOn: [],
      dueAt: null,
      sortOrder: index,
      createdAt: CREATED,
    }),
  );
  return new RunsService(
    { findOne: jest.fn(async () => run) } as unknown as Repository<WorkflowRun>,
    { find: jest.fn(async () => tasks) } as unknown as Repository<Task>,
  );
}

describe('RunsService.get', () => {
  it('returns the whole run, context included, to ADMIN and STAFF', async () => {
    const run = await service([Role.STAFF, Role.COACH, Role.ADMIN]).get({ id: RUN_ID });
    expect(run.context).toEqual(CONTEXT);
    expect(run.tasks).toHaveLength(3);
  });

  it('gives a coach only the tasks they can see and no context', async () => {
    const run = await service([Role.STAFF, Role.COACH, null, Role.ADMIN]).get({ id: RUN_ID, forUser: { role: Role.COACH } });
    expect(run.context).toBeNull();
    expect(run.tasks?.map((task) => task.title)).toEqual(['Tâche 2', 'Tâche 3']);
    expect(run).toMatchObject({ title: 'Onboarding — Amira', progress: { done: 1, total: 4 } });
  });

  it('answers 404 to a coach when none of the tasks is theirs', async () => {
    await expect(service([Role.STAFF, Role.ADMIN]).get({ id: RUN_ID, forUser: { role: Role.COACH } })).rejects.toEqual(
      new NotFoundException('Exécution introuvable.'),
    );
  });
});
