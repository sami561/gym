import { BadRequestException } from '@nestjs/common';
import { CreateWorkflowRequest, TaskType, WorkflowTriggerType } from '@app/common';
import { DEFAULT_WORKFLOWS } from './workflow-templates';
import { normalizeWorkflow } from './workflow-validation';

const base = (patch: Partial<CreateWorkflowRequest> = {}): CreateWorkflowRequest => ({
  name: ' Test ',
  trigger: { type: WorkflowTriggerType.MANUAL },
  tasks: [
    { id: 'a', title: 'Appeler', type: TaskType.MANUAL, dependsOn: [] },
    { id: 'b', title: 'Confirmer', type: TaskType.MANUAL, dependsOn: ['a', 'a'] },
  ],
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

describe('workflow validation', () => {
  it('normalises a valid workflow: trimmed name, deduplicated links, positions filled', () => {
    const workflow = normalizeWorkflow(base());
    expect(workflow.name).toBe('Test');
    expect(workflow.isActive).toBe(true);
    expect(workflow.trigger).toEqual({ type: WorkflowTriggerType.MANUAL, event: null, cron: null });
    expect(workflow.tasks[1].dependsOn).toEqual(['a']);
    expect(workflow.tasks.every((task) => task.position)).toBe(true);
  });

  it('refuses links forming a loop and names the tasks involved', () => {
    const text = message(() =>
      normalizeWorkflow(
        base({
          tasks: [
            { id: 'a', title: 'Appeler', type: TaskType.MANUAL, dependsOn: ['c'] },
            { id: 'b', title: 'Confirmer', type: TaskType.MANUAL, dependsOn: ['a'] },
            { id: 'c', title: 'Relancer', type: TaskType.MANUAL, dependsOn: ['b'] },
          ],
        }),
      ),
    );
    expect(text).toMatch(/^Les liens forment une boucle : /);
    ['« Appeler »', '« Confirmer »', '« Relancer »'].forEach((title) => expect(text).toContain(title));
  });

  it('refuses self links, unknown links, duplicate ids and empty workflows', () => {
    expect(message(() => normalizeWorkflow(base({ tasks: [{ id: 'a', title: 'A', type: TaskType.MANUAL, dependsOn: ['a'] }] })))).toContain(
      "ne peut pas dépendre d'elle-même",
    );
    expect(message(() => normalizeWorkflow(base({ tasks: [{ id: 'a', title: 'A', type: TaskType.MANUAL, dependsOn: ['z'] }] })))).toContain(
      'tâche inconnue (z)',
    );
    expect(
      message(() =>
        normalizeWorkflow(
          base({
            tasks: [
              { id: 'a', title: 'A', type: TaskType.MANUAL, dependsOn: [] },
              { id: 'a', title: 'B', type: TaskType.MANUAL, dependsOn: [] },
            ],
          }),
        ),
      ),
    ).toContain('en double');
    expect(message(() => normalizeWorkflow(base({ tasks: [] })))).toContain('au moins une tâche');
  });

  it('checks triggers: known events and 5-field cron expressions', () => {
    expect(normalizeWorkflow(base({ trigger: { type: WorkflowTriggerType.EVENT, event: 'member.created' } })).trigger.event).toBe(
      'member.created',
    );
    expect(message(() => normalizeWorkflow(base({ trigger: { type: WorkflowTriggerType.EVENT, event: 'user.created' } })))).toContain(
      'Événement déclencheur inconnu',
    );
    expect(normalizeWorkflow(base({ trigger: { type: WorkflowTriggerType.SCHEDULE, cron: ' 45  5 * * 1-6 ' } })).trigger.cron).toBe(
      '45 5 * * 1-6',
    );
    expect(message(() => normalizeWorkflow(base({ trigger: { type: WorkflowTriggerType.SCHEDULE, cron: '0 45 5 * * 1-6' } })))).toContain(
      'Planification invalide',
    );
    expect(message(() => normalizeWorkflow(base({ trigger: { type: WorkflowTriggerType.SCHEDULE, cron: '99 5 * * *' } })))).toContain(
      'Planification invalide',
    );
  });

  it('requires an http(s) URL for automations', () => {
    const automation = (url: string) =>
      normalizeWorkflow(
        base({ tasks: [{ id: 'h', title: 'Webhook', type: TaskType.AUTOMATION, dependsOn: [], automation: { kind: 'WEBHOOK', url } }] }),
      );
    expect(automation('https://n8n.meliora.tn/webhook/x').tasks[0].automation).toEqual({
      kind: 'WEBHOOK',
      url: 'https://n8n.meliora.tn/webhook/x',
      method: 'POST',
      body: null,
    });
    expect(message(() => automation('ftp://x'))).toContain('URL http(s) valide');
    expect(message(() => automation(''))).toContain('URL http(s) valide');
  });

  it('accepts every default Meliora workflow', () => {
    for (const template of DEFAULT_WORKFLOWS) expect(() => normalizeWorkflow(template)).not.toThrow();
  });
});
