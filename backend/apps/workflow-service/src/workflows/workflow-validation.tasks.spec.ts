import { BadRequestException } from '@nestjs/common';
import { CreateWorkflowRequest, Role, TaskType, WorkflowTaskDef, WorkflowTriggerType } from '@app/common';
import { MAX_TASKS_PER_WORKFLOW, normalizeTasks, normalizeTrigger, normalizeWorkflow } from './workflow-validation';

const task = (patch: Partial<WorkflowTaskDef> = {}): WorkflowTaskDef => ({
  id: 'call',
  title: 'Appeler le membre',
  type: TaskType.MANUAL,
  dependsOn: [],
  ...patch,
});

const workflow = (patch: Partial<CreateWorkflowRequest> = {}): CreateWorkflowRequest => ({
  name: 'Relance',
  trigger: { type: WorkflowTriggerType.MANUAL },
  tasks: [task()],
  ...patch,
});

const message = (fn: () => unknown): string => {
  try {
    fn();
  } catch (err) {
    expect(err).toBeInstanceOf(BadRequestException);
    return (err as BadRequestException).message;
  }
  throw new Error('expected a BadRequestException');
};

describe('workflow validation: fields, triggers and tasks', () => {
  describe('workflow fields', () => {
    it('refuses a missing body, a missing or too long name and non-text values', () => {
      expect(message(() => normalizeWorkflow(null as unknown as CreateWorkflowRequest))).toBe('Workflow invalide.');
      expect(message(() => normalizeWorkflow(workflow({ name: '  ' })))).toBe('Le nom du workflow est obligatoire.');
      expect(message(() => normalizeWorkflow(workflow({ name: 'x'.repeat(121) })))).toBe('Texte trop long (120 caractères maximum).');
      expect(message(() => normalizeWorkflow(workflow({ name: 42 as unknown as string })))).toBe('Texte invalide.');
      expect(message(() => normalizeWorkflow(workflow({ titleTemplate: 'x'.repeat(201) })))).toBe(
        'Texte trop long (200 caractères maximum).',
      );
    });

    it('keeps an inactive workflow inactive and blank texts as null', () => {
      expect(normalizeWorkflow(workflow({ isActive: false, description: '  ', titleTemplate: null }))).toMatchObject({
        isActive: false,
        description: null,
        titleTemplate: null,
      });
    });
  });

  describe('normalizeTrigger', () => {
    it('requires a known trigger type', () => {
      const expected = 'Choisissez un déclencheur : manuel, événement ou planification.';
      expect(message(() => normalizeTrigger(undefined))).toBe(expected);
      expect(message(() => normalizeTrigger({ type: 'WEBHOOK' as WorkflowTriggerType }))).toBe(expected);
    });

    it('requires an event for EVENT triggers', () => {
      expect(message(() => normalizeTrigger({ type: WorkflowTriggerType.EVENT }))).toBe('Événement déclencheur inconnu : (vide).');
    });

    it('keeps only the field of the chosen type', () => {
      expect(normalizeTrigger({ type: WorkflowTriggerType.MANUAL, event: 'member.created', cron: '0 6 * * *' })).toEqual({
        type: WorkflowTriggerType.MANUAL,
        event: null,
        cron: null,
      });
      expect(normalizeTrigger({ type: WorkflowTriggerType.SCHEDULE, cron: '0 6 1 * *', event: 'member.created' })).toEqual({
        type: WorkflowTriggerType.SCHEDULE,
        event: null,
        cron: '0 6 1 * *',
      });
      expect(normalizeTrigger({ type: WorkflowTriggerType.EVENT, event: 'stock.low', cron: '0 6 * * *' })).toEqual({
        type: WorkflowTriggerType.EVENT,
        event: 'stock.low',
        cron: null,
      });
    });

    it('requires a cron for SCHEDULE triggers', () => {
      expect(message(() => normalizeTrigger({ type: WorkflowTriggerType.SCHEDULE }))).toContain('Planification invalide');
      expect(message(() => normalizeTrigger({ type: WorkflowTriggerType.SCHEDULE, cron: '0 6 * *' }))).toContain(
        'utilisez 5 champs cron, par ex. « 45 5 * * 1-6 »',
      );
    });
  });

  describe('normalizeTasks', () => {
    it(`accepts up to ${MAX_TASKS_PER_WORKFLOW} tasks`, () => {
      const many = (count: number) => Array.from({ length: count }, (_, index) => task({ id: `t${index}`, title: `Tâche ${index}` }));
      expect(normalizeTasks(many(50))).toHaveLength(50);
      expect(message(() => normalizeTasks(many(51)))).toBe('Un workflow est limité à 50 tâches.');
    });

    it('needs an object with an id and a title for each task', () => {
      expect(message(() => normalizeTasks([null as unknown as WorkflowTaskDef]))).toBe('Tâche invalide.');
      expect(message(() => normalizeTasks([task({ id: ' ' })]))).toBe('Chaque tâche doit avoir un identifiant.');
      expect(message(() => normalizeTasks([task({ id: 'x'.repeat(65) })]))).toBe('Texte trop long (64 caractères maximum).');
      expect(message(() => normalizeTasks([task({ title: '' })]))).toBe('Chaque tâche doit avoir un titre.');
    });

    it('defaults to a manual task and names the task in errors', () => {
      expect(normalizeTasks([task({ type: undefined as unknown as TaskType })])[0].type).toBe(TaskType.MANUAL);
      expect(message(() => normalizeTasks([task({ type: 'ROBOT' as TaskType })]))).toBe('Type de tâche inconnu pour « Appeler le membre ».');
      expect(message(() => normalizeTasks([task({ assigneeRole: 'OWNER' as Role })]))).toBe('Rôle inconnu pour « Appeler le membre ».');
      expect(message(() => normalizeTasks([task({ dependsOn: 'other' as unknown as string[] })]))).toBe(
        'Les liens de « Appeler le membre » sont invalides.',
      );
    });

    it('accepts deadlines from 0 to 8760 hours, rounded to the hour', () => {
      expect(normalizeTasks([task({ dueInHours: 2.6 })])[0].dueInHours).toBe(3);
      expect(normalizeTasks([task({ dueInHours: 0 })])[0].dueInHours).toBe(0);
      expect(normalizeTasks([task({ dueInHours: 8760 })])[0].dueInHours).toBe(8760);
      expect(normalizeTasks([task()])[0].dueInHours).toBeNull();
      for (const dueInHours of [-1, 8761, Number.NaN]) {
        expect(message(() => normalizeTasks([task({ dueInHours })]))).toBe('Délai invalide pour « Appeler le membre » (0 à 8760 heures).');
      }
    });

    it('keeps the assignee and rounds a given position', () => {
      expect(
        normalizeTasks([task({ assigneeRole: Role.STAFF, assigneeName: ' Accueil ', assigneeEmployeeId: null, position: { x: 10.4, y: 20.6 } })])[0],
      ).toMatchObject({ assigneeRole: Role.STAFF, assigneeName: 'Accueil', assigneeEmployeeId: null, position: { x: 10, y: 21 } });
      expect(message(() => normalizeTasks([task({ assigneeName: 'x'.repeat(121) })]))).toBe('Texte trop long (120 caractères maximum).');
    });

    describe('automations', () => {
      const webhook = (automation: WorkflowTaskDef['automation']) =>
        normalizeTasks([task({ id: 'hook', title: 'Prévenir n8n', type: TaskType.AUTOMATION, automation })])[0].automation;

      it('keeps GET, defaults any other method to POST and keeps the JSON body', () => {
        expect(webhook({ kind: 'WEBHOOK', url: 'https://n8n.example.com/webhook/a', method: 'GET' })?.method).toBe('GET');
        expect(
          webhook({ kind: 'WEBHOOK', url: 'https://n8n.example.com/webhook/a', method: 'DELETE' as 'POST', body: { memberId: '{{memberId}}' } }),
        ).toEqual({ kind: 'WEBHOOK', url: 'https://n8n.example.com/webhook/a', method: 'POST', body: { memberId: '{{memberId}}' } });
      });

      it('refuses a body that is not a JSON object', () => {
        for (const body of [['a'], 'texte']) {
          expect(
            message(() => webhook({ kind: 'WEBHOOK', url: 'https://n8n.example.com/webhook/a', body: body as unknown as Record<string, unknown> })),
          ).toBe("Le corps de l'automatisation « Prévenir n8n » doit être un objet JSON.");
        }
      });

      it('drops automation settings from manual tasks', () => {
        expect(normalizeTasks([task({ automation: { kind: 'WEBHOOK', url: 'https://n8n.example.com/webhook/a' } })])[0].automation).toBeNull();
      });
    });
  });
});
