import { AuthUser, STAFF_ROLES, TaskViewer } from '@app/common';

/**
 * Scope of the task and run routes: a coach only reaches the tasks of their role and the
 * unassigned ones (the workflow-service answers 404 for the others). ADMIN and STAFF are
 * not scoped (undefined).
 */
export function taskViewer(user: AuthUser): TaskViewer | undefined {
  return STAFF_ROLES.includes(user.role) ? undefined : { role: user.role };
}
