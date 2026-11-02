import { Role } from '@app/common';
import { throttleTracker } from './throttle-tracker';

describe('throttleTracker', () => {
  it('gives each signed-in user their own bucket', () => {
    const user = { id: 'f3b2c1d0-0000-4000-8000-000000000001', role: Role.MEMBER, email: 'a@meliora.tn', name: 'A B' };
    expect(throttleTracker(user, '203.0.113.7')).toBe('user:f3b2c1d0-0000-4000-8000-000000000001');
  });

  it('counts anonymous requests per client address', () => {
    expect(throttleTracker(undefined, '203.0.113.7')).toBe('203.0.113.7');
    expect(throttleTracker(null, '203.0.113.7')).toBe('203.0.113.7');
    expect(throttleTracker({ id: '' }, '203.0.113.7')).toBe('203.0.113.7');
    expect(throttleTracker({ id: 42 }, '203.0.113.7')).toBe('203.0.113.7');
  });
});
