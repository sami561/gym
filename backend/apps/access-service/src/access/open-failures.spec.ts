import { REASONS } from './access-decision';
import { agentFailure } from './open-failures';

describe('agentFailure', () => {
  it('keeps the relay status but never the body the agent quotes', () => {
    const failure = agentFailure('Relay answered HTTP 401: <html>token=abc123 admin panel</html>');
    expect(failure.error).toBe('Le relais a répondu 401.');
    expect(failure.error).not.toContain('abc123');
    expect(failure.detail).toContain('abc123'); // service log only
  });

  it('summarises other agent errors in French', () => {
    expect(agentFailure('Terminal 192.168.1.201:4370 unreachable (ETIMEDOUT)')).toEqual({
      ok: false,
      error: REASONS.agentFailed,
      detail: 'Terminal 192.168.1.201:4370 unreachable (ETIMEDOUT)',
    });
    expect(agentFailure(undefined)).toEqual({ ok: false, error: REASONS.agentFailed });
    expect(agentFailure({ not: 'a string' })).toEqual({ ok: false, error: REASONS.agentFailed });
  });

  it('caps the detail kept for the log', () => {
    expect(agentFailure('x'.repeat(1000)).detail).toHaveLength(300);
  });
});
