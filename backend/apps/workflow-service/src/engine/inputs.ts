import { BadRequestException, ConflictException } from '@nestjs/common';
import { Role, TaskStatus, TaskType, WorkflowRunStatus } from '@app/common';
import { fillTemplate } from './templating';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function requiredTitle(value: unknown): string {
  const title = typeof value === 'string' ? value.trim() : '';
  if (!title) throw new BadRequestException('Le titre de la tâche est obligatoire.');
  if (title.length > 160) throw new BadRequestException('Titre trop long (160 caractères maximum).');
  return title;
}

export function optionalText(value: unknown): string | null {
  if (value === null || value === undefined) return null;
  if (typeof value !== 'string') throw new BadRequestException('Texte invalide.');
  return value.trim() || null;
}

export function parseDate(value: unknown): Date | null {
  if (value === null || value === undefined || value === '') return null;
  if (typeof value !== 'string' && typeof value !== 'number') throw new BadRequestException('Date invalide.');
  const date = new Date(String(value));
  if (Number.isNaN(date.getTime())) throw new BadRequestException(`Date invalide : ${value}.`);
  return date;
}

export function parseRole(value: unknown): Role | null {
  if (value === null || value === undefined || value === '') return null;
  if (!Object.values(Role).includes(value as Role)) {
    throw new BadRequestException(typeof value === 'string' ? `Rôle inconnu : ${value}.` : 'Rôle inconnu.');
  }
  return value as Role;
}

/** Linked task ids: unique, trimmed, real uuids (anything else cannot exist). */
export function normalizeIds(value: unknown): string[] {
  if (value === null || value === undefined) return [];
  if (!Array.isArray(value)) throw new BadRequestException('Les liens doivent être une liste de tâches.');
  const ids = [...new Set(value.map((id) => String(id).trim()).filter(Boolean))];
  if (ids.some((id) => !UUID.test(id))) throw new BadRequestException('Tâche liée introuvable.');
  return ids;
}

export function assertRunOpen(run: { status: WorkflowRunStatus }): void {
  if (run.status === WorkflowRunStatus.CANCELLED) throw new ConflictException('Ce workflow a été annulé.');
  if (run.status === WorkflowRunStatus.COMPLETED) throw new ConflictException('Ce workflow est terminé.');
}

export const isRunningAutomation = (task: { type: TaskType; status: TaskStatus }): boolean =>
  task.type === TaskType.AUTOMATION && task.status === TaskStatus.IN_PROGRESS;

function formatter(options: Intl.DateTimeFormatOptions): Intl.DateTimeFormat {
  return new Intl.DateTimeFormat('fr-FR', { ...options, timeZone: process.env.TZ || 'Africa/Tunis' });
}

/** Values every run can use in {{placeholders}}, overridden by the trigger context. */
export function runContext(context: Record<string, unknown>, now: Date): Record<string, unknown> {
  return {
    date: formatter({ dateStyle: 'short' }).format(now),
    time: formatter({ timeStyle: 'short' }).format(now),
    ...context,
  };
}

/** Explicit title, else the filled template (without dangling separators), else "<name> — <date heure>". */
export function runTitle(
  workflow: { name: string; titleTemplate: string | null },
  context: Record<string, unknown>,
  explicit: string | undefined,
  now: Date,
): string {
  const fromTemplate = workflow.titleTemplate
    ? fillTemplate(workflow.titleTemplate, context)
        .replace(/[\s—–-]+$/u, '')
        .trim()
    : '';
  const fallback = `${workflow.name} — ${formatter({ dateStyle: 'short', timeStyle: 'short' }).format(now)}`;
  return (explicit?.trim() || fromTemplate || fallback).slice(0, 200);
}
