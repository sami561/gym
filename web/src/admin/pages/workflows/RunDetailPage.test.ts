import { describe, expect, it } from 'vitest';
import type { TaskStatus } from '../../../api/types-ops';
import { nextActions } from './RunDetailPage';

const ALL: TaskStatus[] = ['BLOCKED', 'TODO', 'IN_PROGRESS', 'DONE', 'SKIPPED', 'FAILED'];

describe('nextActions (quick buttons on a manual task)', () => {
  it.each([
    ['TODO', [['IN_PROGRESS', 'Commencer'], ['DONE', 'Terminer'], ['SKIPPED', 'Ignorer']]],
    ['IN_PROGRESS', [['DONE', 'Terminer'], ['SKIPPED', 'Ignorer']]],
    ['DONE', [['TODO', 'Rouvrir']]],
    ['SKIPPED', [['TODO', 'Rouvrir']]],
    ['BLOCKED', []],
    ['FAILED', []],
  ] as const)('%s offers %j', (status, expected) => {
    expect(nextActions(status).map((action) => [action.status, action.label])).toEqual(expected);
  });

  it('never offers what only the engine sets (BLOCKED, FAILED) nor the current status', () => {
    // backend workflow-service task-rules.ts: BLOCKED and FAILED are computed, never chosen.
    for (const status of ALL) {
      const targets = nextActions(status).map((action) => action.status);
      expect(targets).not.toContain('BLOCKED');
      expect(targets).not.toContain('FAILED');
      expect(targets).not.toContain(status);
    }
  });
});
