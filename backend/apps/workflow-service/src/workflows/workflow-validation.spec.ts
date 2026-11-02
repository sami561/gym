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

  it('requires an http(s) URL without credentials for automations, naming the task', () => {
    const automation = (url: string) =>
      normalizeWorkflow(
        base({ tasks: [{ id: 'h', title: 'Webhook', type: TaskType.AUTOMATION, dependsOn: [], automation: { kind: 'WEBHOOK', url } }] }),
      );
    expect(automation(' https://n8n.meliora.tn/webhook/x ').tasks[0].automation).toEqual({
      kind: 'WEBHOOK',
      url: 'https://n8n.meliora.tn/webhook/x',
      method: 'POST',
      body: null,
    });
    // Placeholders are kept as typed: they are filled (and the destination checked) at each call.
    expect(automation('http://n8n:5678/webhook/{{memberId}}').tasks[0].automation?.url).toBe('http://n8n:5678/webhook/{{memberId}}');
    expect(message(() => automation('ftp://x'))).toBe(
      'Automatisation « Webhook » : URL invalide : seuls les protocoles http et https sont acceptés.',
    );
    expect(message(() => automation('file:///etc/passwd'))).toContain('seuls les protocoles http et https');
    expect(message(() => automation(''))).toBe('Automatisation « Webhook » : URL invalide.');
    expect(message(() => automation('pas une url'))).toBe('Automatisation « Webhook » : URL invalide.');
    expect(message(() => automation('http://admin:secret@n8n:5678/webhook/x'))).toBe(
      "Automatisation « Webhook » : URL invalide : retirez l'identifiant et le mot de passe de l'URL.",
    );
    expect(message(() => automation(`https://n8n.meliora.tn/${'a'.repeat(2048)}`))).toBe(
      'Automatisation « Webhook » : URL trop longue (2048 caractères maximum).',
    );
    const missing = base({ tasks: [{ id: 'h', title: 'Webhook', type: TaskType.AUTOMATION, dependsOn: [] }] });
    expect(message(() => normalizeWorkflow(missing))).toBe('Automatisation « Webhook » : URL invalide.');
  });

  it('accepts every default Meliora workflow', () => {
    for (const template of DEFAULT_WORKFLOWS) expect(() => normalizeWorkflow(template)).not.toThrow();
  });
});
