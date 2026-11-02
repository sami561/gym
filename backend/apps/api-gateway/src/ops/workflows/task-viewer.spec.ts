import { AuthUser, Role } from '@app/common';
import { taskViewer } from './task-viewer';

const user = (role: Role): AuthUser => ({ id: 'user-1', role, email: 'equipe@meliora-gym.tn', name: 'Équipe' });

describe('taskViewer', () => {
  it('scopes coaches to their role and leaves ADMIN and STAFF unscoped', () => {
    expect(taskViewer(user(Role.COACH))).toEqual({ role: Role.COACH });
    expect(taskViewer(user(Role.ADMIN))).toBeUndefined();
    expect(taskViewer(user(Role.STAFF))).toBeUndefined();
  });

  it('scopes any other role too', () => {
    expect(taskViewer(user(Role.MEMBER))).toEqual({ role: Role.MEMBER });
  });
});
