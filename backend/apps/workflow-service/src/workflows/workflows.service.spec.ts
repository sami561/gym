import { BadRequestException, Logger, NotFoundException } from '@nestjs/common';
import { Repository } from 'typeorm';
import { TaskType, WorkflowTriggerType } from '@app/common';
import { WorkflowEngine } from '../engine/workflow-engine.service';
import { WorkflowScheduler } from './workflow-scheduler.service';
import { DEFAULT_WORKFLOWS } from './workflow-templates';
import { Workflow } from './workflow.entity';
import { WorkflowsService } from './workflows.service';

const ID = '6c1f3a52-9b7e-4d21-8f3a-0e5b7c9d1a24';
const at = new Date('2026-11-02T09:00:00.000Z');

function stored(overrides: Partial<Workflow> = {}): Workflow {
  return Object.assign(new Workflow(), {
    id: ID,
    name: 'Relance',
    description: 'Relancer les membres',
    titleTemplate: null,
    trigger: { type: WorkflowTriggerType.MANUAL, event: null, cron: null },
    isActive: true,
    tasks: [{ id: 'call', title: 'Appeler', type: TaskType.MANUAL, dependsOn: [], position: { x: 80, y: 80 } }],
    runCount: 3,
    createdAt: at,
    updatedAt: at,
    ...overrides,
  });
}

function setup({
  found = stored(),
  matching = [],
  count = 1,
  all = [],
}: { found?: Workflow | null; matching?: Workflow[]; count?: number; all?: Workflow[] } = {}) {
  const qb: Record<string, jest.Mock> = {};
  for (const method of ['where', 'andWhere']) qb[method] = jest.fn(() => qb);
  qb.getMany = jest.fn().mockResolvedValue(matching);
  const workflows = {
    findOne: jest.fn().mockResolvedValue(found),
    find: jest.fn().mockResolvedValue(all),
    count: jest.fn().mockResolvedValue(count),
    create: jest.fn((data: Partial<Workflow>) => Object.assign(new Workflow(), data)),
    save: jest.fn(async (row: Workflow) => Object.assign(row, { id: row.id ?? ID, createdAt: row.createdAt ?? at, updatedAt: at })),
    delete: jest.fn().mockResolvedValue({ affected: 1 }),
    createQueryBuilder: jest.fn(() => qb),
  };
  const scheduler = { sync: jest.fn(), unregister: jest.fn() };
  const engine = { start: jest.fn() };
  const service = new WorkflowsService(
    workflows as unknown as Repository<Workflow>,
    scheduler as unknown as WorkflowScheduler,
    engine as unknown as WorkflowEngine,
  );
  return { service, workflows, scheduler, engine, qb };
}

describe('WorkflowsService', () => {
  beforeEach(() => {
    jest.spyOn(Logger.prototype, 'log').mockImplementation(() => undefined);
    jest.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined);
  });
  afterEach(() => jest.restoreAllMocks());

  describe('triggerEvent (EVENT triggers)', () => {
    it('starts every active workflow listening to the event with its payload', async () => {
      const first = stored({ id: 'w-1', name: 'Accueil' });
      const second = stored({ id: 'w-2', name: 'Relance coach' });
      const { service, engine, qb } = setup({ matching: [first, second] });
      engine.start.mockResolvedValue({ title: 'Onboarding — Amira' });

      await service.triggerEvent('member.created', { memberId: 'm-1', firstName: 'Amira' });

      expect(qb.andWhere).toHaveBeenCalledWith(`"w"."trigger"->>'event' = :event`, { event: 'member.created' });
      expect(engine.start.mock.calls).toEqual([
        [{ workflowId: 'w-1', context: { memberId: 'm-1', firstName: 'Amira' } }, 'Automatique (member.created)'],
        [{ workflowId: 'w-2', context: { memberId: 'm-1', firstName: 'Amira' } }, 'Automatique (member.created)'],
      ]);
    });

    it('keeps going when one workflow fails to start', async () => {
      const { service, engine } = setup({ matching: [stored({ id: 'w-1', name: 'Cassé' }), stored({ id: 'w-2' })] });
      engine.start.mockRejectedValueOnce(new Error('Ce workflow est désactivé.')).mockResolvedValueOnce({ title: 'ok' });
      await expect(service.triggerEvent('stock.low', {})).resolves.toBeUndefined();
      expect(engine.start).toHaveBeenCalledTimes(2);
      expect(Logger.prototype.error).toHaveBeenCalledWith('stock.low could not start "Cassé": Ce workflow est désactivé.');
    });
  });

  describe('create / update / remove', () => {
    it('validates, saves with no runs yet and schedules', async () => {
      const { service, workflows, scheduler } = setup();
      const dto = await service.create({
        name: ' Ouverture ',
        trigger: { type: WorkflowTriggerType.SCHEDULE, cron: '45 5 * * 1-6' },
        tasks: [{ id: 'open', title: 'Ouvrir la salle', type: TaskType.MANUAL, dependsOn: [] }],
      });
      expect(workflows.create).toHaveBeenCalledWith(expect.objectContaining({ name: 'Ouverture', runCount: 0 }));
      expect(scheduler.sync).toHaveBeenCalledWith(expect.objectContaining({ id: ID, name: 'Ouverture' }));
      expect(dto.trigger).toEqual({ type: WorkflowTriggerType.SCHEDULE, event: null, cron: '45 5 * * 1-6' });
    });

    it('refuses an invalid workflow before saving', async () => {
      const { service, workflows } = setup();
      await expect(service.create({ name: 'Vide', trigger: { type: WorkflowTriggerType.MANUAL }, tasks: [] })).rejects.toThrow(
        new BadRequestException('Ajoutez au moins une tâche au workflow.'),
      );
      expect(workflows.save).not.toHaveBeenCalled();
    });

    it('merges an update with the stored workflow and reschedules it', async () => {
      const { service, scheduler } = setup();
      const dto = await service.update({ id: ID, data: { description: null, trigger: { type: WorkflowTriggerType.SCHEDULE, cron: '0 22 * * *' } } });
      expect(dto).toMatchObject({ name: 'Relance', description: null, runCount: 3 });
      expect(dto.tasks.map((t) => t.id)).toEqual(['call']);
      expect(scheduler.sync).toHaveBeenCalledWith(expect.objectContaining({ trigger: { type: WorkflowTriggerType.SCHEDULE, event: null, cron: '0 22 * * *' } }));
    });

    it('keeps fields the update leaves out', async () => {
      const dto = await setup().service.update({ id: ID, data: { isActive: false } });
      expect(dto).toMatchObject({ isActive: false, description: 'Relancer les membres' });
    });

    it('deletes and unschedules', async () => {
      const { service, workflows, scheduler } = setup();
      expect(await service.remove(ID)).toEqual({ ok: true });
      expect(workflows.delete).toHaveBeenCalledWith({ id: ID });
      expect(scheduler.unregister).toHaveBeenCalledWith(ID);
    });

    it('answers 404 for a malformed or unknown id', async () => {
      const { service, workflows } = setup({ found: null });
      await expect(service.get('relance')).rejects.toThrow(new NotFoundException('Workflow introuvable.'));
      expect(workflows.findOne).not.toHaveBeenCalled();
      await expect(service.get(ID)).rejects.toThrow('Workflow introuvable.');
    });
  });

  describe('first boot', () => {
    it('seeds the default workflows once, then schedules every workflow', async () => {
      const all = [stored({ id: 'w-1' }), stored({ id: 'w-2' })];
      const { service, workflows, scheduler } = setup({ count: 0, all });
      await service.onApplicationBootstrap();
      expect(workflows.save).toHaveBeenCalledTimes(DEFAULT_WORKFLOWS.length);
      expect(scheduler.sync.mock.calls.map(([w]) => w.id)).toEqual(['w-1', 'w-2']);
    });

    it('does not seed again when workflows exist', async () => {
      const { service, workflows } = setup({ count: 4 });
      await service.onApplicationBootstrap();
      expect(workflows.save).not.toHaveBeenCalled();
    });
  });
});
