import { BadRequestException } from '@nestjs/common';
import { validateCronExpression } from 'cron';
import {
  CreateWorkflowRequest,
  Role,
  TRIGGERABLE_EVENTS,
  TaskAutomation,
  TaskType,
  WorkflowTaskDef,
  WorkflowTrigger,
  WorkflowTriggerType,
} from '@app/common';
import { autoLayout, findCycle } from '../engine/graph';
import { quoteTitles } from '../engine/task-rules';
import { isPlainObject } from '../engine/templating';

export const MAX_TASKS_PER_WORKFLOW = 50;

export interface NormalizedWorkflow {
  name: string;
  description: string | null;
  titleTemplate: string | null;
  trigger: WorkflowTrigger;
  isActive: boolean;
  tasks: WorkflowTaskDef[];
}

function text(value: unknown, max: number): string | null {
  if (value === null || value === undefined) return null;
  if (typeof value !== 'string') throw new BadRequestException('Texte invalide.');
  const trimmed = value.trim();
  if (trimmed.length > max) throw new BadRequestException(`Texte trop long (${max} caractères maximum).`);
  return trimmed || null;
}

function required(value: unknown, max: number, message: string): string {
  const result = text(value, max);
  if (!result) throw new BadRequestException(message);
  return result;
}

export function normalizeTrigger(trigger: WorkflowTrigger | undefined): WorkflowTrigger {
  if (!trigger || !Object.values(WorkflowTriggerType).includes(trigger.type)) {
    throw new BadRequestException('Choisissez un déclencheur : manuel, événement ou planification.');
  }
  if (trigger.type === WorkflowTriggerType.EVENT) {
    if (!trigger.event || !(TRIGGERABLE_EVENTS as readonly string[]).includes(trigger.event)) {
      throw new BadRequestException(`Événement déclencheur inconnu : ${trigger.event ?? '(vide)'}.`);
    }
    return { type: trigger.type, event: trigger.event, cron: null };
  }
  if (trigger.type === WorkflowTriggerType.SCHEDULE) {
    const cron = (trigger.cron ?? '').trim().replace(/\s+/g, ' ');
    if (cron.split(' ').length !== 5 || !validateCronExpression(cron).valid) {
      throw new BadRequestException(
        `Planification invalide « ${trigger.cron ?? ''} » : utilisez 5 champs cron, par ex. « 45 5 * * 1-6 ».`,
      );
    }
    return { type: trigger.type, event: null, cron };
  }
  return { type: WorkflowTriggerType.MANUAL, event: null, cron: null };
}

function normalizeAutomation(title: string, automation: TaskAutomation | null | undefined): TaskAutomation {
  let url: URL | null = null;
  try {
    url = automation?.url ? new URL(automation.url.trim()) : null;
  } catch {
    url = null;
  }
  if (!url || !['http:', 'https:'].includes(url.protocol)) {
    throw new BadRequestException(`L'automatisation « ${title} » doit avoir une URL http(s) valide.`);
  }
  if (automation?.body !== undefined && automation.body !== null && !isPlainObject(automation.body)) {
    throw new BadRequestException(`Le corps de l'automatisation « ${title} » doit être un objet JSON.`);
  }
  return {
    kind: 'WEBHOOK',
    url: automation!.url.trim(),
    method: automation?.method === 'GET' ? 'GET' : 'POST',
    body: automation?.body ?? null,
  };
}

function normalizeTask(def: WorkflowTaskDef): WorkflowTaskDef {
  if (!def || typeof def !== 'object') throw new BadRequestException('Tâche invalide.');
  const id = required(def.id, 64, 'Chaque tâche doit avoir un identifiant.');
  const title = required(def.title, 160, 'Chaque tâche doit avoir un titre.');
  const type = def.type ?? TaskType.MANUAL;
  if (!Object.values(TaskType).includes(type)) throw new BadRequestException(`Type de tâche inconnu pour « ${title} ».`);
  if (def.assigneeRole && !Object.values(Role).includes(def.assigneeRole)) {
    throw new BadRequestException(`Rôle inconnu pour « ${title} ».`);
  }
  const dueInHours = def.dueInHours ?? null;
  if (dueInHours !== null && (!Number.isFinite(dueInHours) || dueInHours < 0 || dueInHours > 8760)) {
    throw new BadRequestException(`Délai invalide pour « ${title} » (0 à 8760 heures).`);
  }
  if (def.dependsOn !== undefined && !Array.isArray(def.dependsOn)) {
    throw new BadRequestException(`Les liens de « ${title} » sont invalides.`);
  }
  const dependsOn = [...new Set((def.dependsOn ?? []).map((dep) => String(dep).trim()).filter(Boolean))];
  const position =
    def.position && Number.isFinite(def.position.x) && Number.isFinite(def.position.y)
      ? { x: Math.round(def.position.x), y: Math.round(def.position.y) }
      : null;
  return {
    id,
    title,
    description: text(def.description, 2000),
    type,
    assigneeRole: def.assigneeRole ?? null,
    assigneeEmployeeId: text(def.assigneeEmployeeId, 64),
    assigneeName: text(def.assigneeName, 120),
    dueInHours: dueInHours === null ? null : Math.round(dueInHours),
    dependsOn,
    automation: type === TaskType.AUTOMATION ? normalizeAutomation(title, def.automation) : null,
    position,
  };
}

/** Validates the tasks of a workflow: unique ids, existing links, no self-link, no cycle. */
export function normalizeTasks(input: WorkflowTaskDef[] | undefined): WorkflowTaskDef[] {
  if (!Array.isArray(input) || input.length === 0) {
    throw new BadRequestException('Ajoutez au moins une tâche au workflow.');
  }
  if (input.length > MAX_TASKS_PER_WORKFLOW) {
    throw new BadRequestException(`Un workflow est limité à ${MAX_TASKS_PER_WORKFLOW} tâches.`);
  }
  const tasks = input.map(normalizeTask);
  const titleById = new Map<string, string>();
  for (const task of tasks) {
    if (titleById.has(task.id)) throw new BadRequestException(`Identifiant de tâche en double : « ${task.id} ».`);
    titleById.set(task.id, task.title);
  }
  for (const task of tasks) {
    if (task.dependsOn.includes(task.id)) {
      throw new BadRequestException(`La tâche « ${task.title} » ne peut pas dépendre d'elle-même.`);
    }
    const unknown = task.dependsOn.find((dep) => !titleById.has(dep));
    if (unknown) throw new BadRequestException(`La tâche « ${task.title} » est liée à une tâche inconnue (${unknown}).`);
  }
  const cycle = findCycle(tasks);
  if (cycle) {
    const titles = cycle.map((id) => titleById.get(id) ?? id);
    throw new BadRequestException(`Les liens forment une boucle : ${quoteTitles(titles).replace(/, /g, ' → ')}.`);
  }
  return autoLayout(tasks);
}

export function normalizeWorkflow(input: CreateWorkflowRequest): NormalizedWorkflow {
  if (!input || typeof input !== 'object') throw new BadRequestException('Workflow invalide.');
  return {
    name: required(input.name, 120, 'Le nom du workflow est obligatoire.'),
    description: text(input.description, 2000),
    titleTemplate: text(input.titleTemplate, 200),
    trigger: normalizeTrigger(input.trigger),
    isActive: input.isActive ?? true,
    tasks: normalizeTasks(input.tasks),
  };
}
