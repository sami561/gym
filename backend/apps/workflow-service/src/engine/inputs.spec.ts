import { BadRequestException, ConflictException } from '@nestjs/common';
import { Role, TaskStatus, TaskType, WorkflowRunStatus } from '@app/common';
import {
  assertRunOpen,
  isRunningAutomation,
  normalizeIds,
  optionalText,
  parseDate,
  parseRole,
  requiredTitle,
  runContext,
  runTitle,
} from './inputs';

const TASK_A = '3f1c2b9e-8d4a-4f6b-9c1e-2a7d5e8f0b13';
const TASK_B = 'a9e8d7c6-b5a4-4321-8fed-cba987654321';
// 23:30 UTC on 2 Nov = 00:30 on 3 Nov in Tunis.
const NOW = new Date('2026-11-02T23:30:00.000Z');

describe('workflow engine inputs', () => {
  describe('requiredTitle', () => {
    it('trims and keeps up to 160 characters', () => {
      expect(requiredTitle('  Appeler le membre ')).toBe('Appeler le membre');
      expect(requiredTitle('x'.repeat(160))).toHaveLength(160);
    });

    it('refuses blank or too long titles', () => {
      for (const value of ['', '   ', undefined, 42]) {
        expect(() => requiredTitle(value)).toThrow(new BadRequestException('Le titre de la tâche est obligatoire.'));
      }
      expect(() => requiredTitle('x'.repeat(161))).toThrow('Titre trop long (160 caractères maximum).');
    });
  });

  describe('optionalText / parseDate / parseRole', () => {
    it('treats blank values as empty and refuses non-strings', () => {
      expect(optionalText(undefined)).toBeNull();
      expect(optionalText('   ')).toBeNull();
      expect(optionalText(' Note ')).toBe('Note');
      expect(() => optionalText({ text: 'x' })).toThrow('Texte invalide.');
    });

    it('reads due dates and names an unreadable one', () => {
      expect(parseDate(null)).toBeNull();
      expect(parseDate('')).toBeNull();
      expect(parseDate('2026-11-03T08:00:00.000Z')?.toISOString()).toBe('2026-11-03T08:00:00.000Z');
      expect(() => parseDate('demain')).toThrow('Date invalide : demain.');
    });

    it('accepts known roles only', () => {
      expect(parseRole('')).toBeNull();
      expect(parseRole(Role.COACH)).toBe(Role.COACH);
      expect(() => parseRole('OWNER')).toThrow('Rôle inconnu : OWNER.');
    });
  });

  describe('normalizeIds (task links)', () => {
    it('trims, drops blanks and duplicates', () => {
      expect(normalizeIds(undefined)).toEqual([]);
      expect(normalizeIds([` ${TASK_A} `, TASK_B, TASK_A, ''])).toEqual([TASK_A, TASK_B]);
    });

    it('refuses anything that cannot be a task id', () => {
      expect(() => normalizeIds(TASK_A)).toThrow('Les liens doivent être une liste de tâches.');
      expect(() => normalizeIds([TASK_A, 'task-2'])).toThrow(new BadRequestException('Tâche liée introuvable.'));
    });
  });

  describe('run state', () => {
    it('refuses changes to a cancelled or completed run', () => {
      expect(() => assertRunOpen({ status: WorkflowRunStatus.CANCELLED })).toThrow(new ConflictException('Ce workflow a été annulé.'));
      expect(() => assertRunOpen({ status: WorkflowRunStatus.COMPLETED })).toThrow('Ce workflow est terminé.');
      expect(() => assertRunOpen({ status: WorkflowRunStatus.RUNNING })).not.toThrow();
    });

    it('spots automations being executed', () => {
      expect(isRunningAutomation({ type: TaskType.AUTOMATION, status: TaskStatus.IN_PROGRESS })).toBe(true);
      expect(isRunningAutomation({ type: TaskType.AUTOMATION, status: TaskStatus.TODO })).toBe(false);
      expect(isRunningAutomation({ type: TaskType.MANUAL, status: TaskStatus.IN_PROGRESS })).toBe(false);
    });
  });

  describe('runContext', () => {
    it('offers the gym date and time, overridable by the trigger', () => {
      expect(runContext({ firstName: 'Amira' }, NOW)).toEqual({ date: '03/11/2026', time: '00:30', firstName: 'Amira' });
      expect(runContext({ date: '01/01/2027' }, NOW).date).toBe('01/01/2027');
    });
  });

  describe('runTitle', () => {
    const workflow = { name: 'Accueil nouveau membre', titleTemplate: 'Onboarding — {{firstName}} {{lastName}}' };

    it('prefers an explicit title', () => {
      expect(runTitle(workflow, {}, '  Onboarding VIP ', NOW)).toBe('Onboarding VIP');
    });

    it('fills the template and drops dangling separators', () => {
      expect(runTitle(workflow, { firstName: 'Amira', lastName: 'Ben Salah' }, undefined, NOW)).toBe('Onboarding — Amira Ben Salah');
      expect(runTitle(workflow, { firstName: 'Amira' }, '  ', NOW)).toBe('Onboarding — Amira');
      expect(runTitle(workflow, {}, undefined, NOW)).toBe('Onboarding');
    });

    it('falls back to the workflow name and the gym date-time', () => {
      expect(runTitle({ ...workflow, titleTemplate: null }, {}, undefined, NOW)).toBe('Accueil nouveau membre — 03/11/2026 00:30');
      expect(runTitle({ ...workflow, titleTemplate: '{{memberName}}' }, {}, undefined, NOW)).toBe('Accueil nouveau membre — 03/11/2026 00:30');
    });

    it('caps titles at 200 characters', () => {
      expect(runTitle(workflow, {}, 'x'.repeat(250), NOW)).toHaveLength(200);
    });
  });
});
