import { Logger } from '@nestjs/common';
import { SchedulerRegistry } from '@nestjs/schedule';
import { WorkflowTriggerType } from '@app/common';
import { WorkflowEngine } from '../engine/workflow-engine.service';
import { WorkflowScheduler } from './workflow-scheduler.service';
import { Workflow } from './workflow.entity';

const ID = '6c1f3a52-9b7e-4d21-8f3a-0e5b7c9d1a24';
const JOB = `workflow:${ID}`;

function workflow(overrides: Partial<Workflow> = {}): Workflow {
  return Object.assign(new Workflow(), {
    id: ID,
    name: 'Ouverture de la salle',
    isActive: true,
    trigger: { type: WorkflowTriggerType.SCHEDULE, event: null, cron: '45 5 * * 1-6' },
    tasks: [],
    ...overrides,
  });
}

describe('WorkflowScheduler (SCHEDULE triggers in Africa/Tunis)', () => {
  let registry: SchedulerRegistry;
  let engine: { start: jest.Mock };
  let scheduler: WorkflowScheduler;

  beforeEach(() => {
    // Monday 2 Nov 2026, 10:00 in Tunis (09:00 UTC).
    jest.useFakeTimers({ now: new Date('2026-11-02T09:00:00.000Z') });
    jest.spyOn(Logger.prototype, 'log').mockImplementation(() => undefined);
    jest.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined);
    registry = new SchedulerRegistry();
    engine = { start: jest.fn().mockResolvedValue({ title: 'Ouverture — 03/11/2026' }) };
    scheduler = new WorkflowScheduler(registry, engine as unknown as WorkflowEngine);
  });

  afterEach(() => {
    registry.getCronJobs().forEach((job) => void job.stop());
    jest.useRealTimers();
    jest.restoreAllMocks();
  });

  it('schedules an active SCHEDULE workflow at gym time', () => {
    scheduler.sync(workflow());
    const job = registry.getCronJob(JOB);
    expect(job.isActive).toBe(true);
    expect(job.cronTime.source).toBe('45 5 * * 1-6');
    // Next Monday-to-Saturday 05:45 in Tunis is Tuesday 3 Nov, 04:45 UTC.
    expect(job.nextDate().toUTC().toISO()).toBe('2026-11-03T04:45:00.000Z');
  });

  it('starts a run when the time comes', async () => {
    scheduler.sync(workflow());
    await jest.advanceTimersByTimeAsync(19 * 3_600_000 + 45 * 60_000);
    expect(engine.start).toHaveBeenCalledTimes(1);
    const [request, startedBy] = engine.start.mock.calls[0];
    expect(request).toEqual({ workflowId: ID, context: { scheduledAt: expect.stringMatching(/^2026-11-03T04:45:/) } });
    expect(startedBy).toBe('Planification');
  });

  it('skips Sundays as the cron says', () => {
    scheduler.sync(workflow());
    const nextDays = registry
      .getCronJob(JOB)
      .nextDates(6)
      .map((date) => date.setZone('Africa/Tunis').toFormat('ccc dd HH:mm'));
    expect(nextDays).toEqual(['Tue 03 05:45', 'Wed 04 05:45', 'Thu 05 05:45', 'Fri 06 05:45', 'Sat 07 05:45', 'Mon 09 05:45']);
  });

  it.each([
    ['inactive', workflow({ isActive: false })],
    ['manual', workflow({ trigger: { type: WorkflowTriggerType.MANUAL, event: null, cron: null } })],
    ['event', workflow({ trigger: { type: WorkflowTriggerType.EVENT, event: 'member.created', cron: null } })],
    ['without cron', workflow({ trigger: { type: WorkflowTriggerType.SCHEDULE, event: null, cron: null } })],
  ])('does not schedule an %s workflow and removes its old job', (_label, changed) => {
    scheduler.sync(workflow());
    scheduler.sync(changed);
    expect(registry.doesExist('cron', JOB)).toBe(false);
  });

  it('replaces the job when the schedule changes and unregisters on delete', () => {
    scheduler.sync(workflow());
    scheduler.sync(workflow({ trigger: { type: WorkflowTriggerType.SCHEDULE, event: null, cron: '0 22 * * *' } }));
    expect(registry.getCronJob(JOB).cronTime.source).toBe('0 22 * * *');
    expect(registry.getCronJobs().size).toBe(1);
    scheduler.unregister(ID);
    expect(registry.doesExist('cron', JOB)).toBe(false);
    expect(() => scheduler.unregister(ID)).not.toThrow();
  });

  it('logs a failed scheduled run instead of crashing', async () => {
    engine.start.mockRejectedValue(new Error('Ce workflow est désactivé.'));
    scheduler.sync(workflow());
    await registry.getCronJob(JOB).fireOnTick();
    await Promise.resolve();
    expect(Logger.prototype.error).toHaveBeenCalledWith(`Scheduled run of ${ID} failed: Ce workflow est désactivé.`);
  });
});
