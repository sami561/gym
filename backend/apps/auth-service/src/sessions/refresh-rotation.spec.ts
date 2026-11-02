import { Role } from '@app/common';
import { RefreshFamilyState, judgeRefresh, refreshClaims, refreshFamilyChanges } from './refresh-rotation';

const A = '0b1f0f7e-8a43-4c55-9d43-6a1c2a7f0001';
const B = '0b1f0f7e-8a43-4c55-9d43-6a1c2a7f0002';
const C = '0b1f0f7e-8a43-4c55-9d43-6a1c2a7f0003';
const USER = '5d0c3c38-61c6-4c55-8f3e-1f2f6d0a0b0c';
const FAMILY = '9a3a8d3e-2f1b-4f6e-a1c2-3b4c5d6e7f80';

const TTL = 30 * 86_400;
const LEEWAY = 30;
const t0 = new Date('2026-11-02T10:00:00.000Z');
const at = (seconds: number) => new Date(t0.getTime() + seconds * 1000);

function family(patch: Partial<RefreshFamilyState> = {}): RefreshFamilyState {
  return {
    currentJti: A,
    previousJti: null,
    rotatedAt: null,
    expiresAt: at(TTL),
    revokedAt: null,
    lastUsedAt: t0,
    ...patch,
  };
}

/** What RefreshSessionsService.use does with the family row. */
function exchange(state: RefreshFamilyState, jti: string, now: Date, newJti: string) {
  const verdict = judgeRefresh(state, jti, now, LEEWAY);
  return { verdict, state: { ...state, ...refreshFamilyChanges(state, verdict, now, TTL, newJti) } };
}

describe('refresh token rotation', () => {
  describe('judgeRefresh', () => {
    it('rotates the newest token of the family', () => {
      expect(judgeRefresh(family(), A, at(60), LEEWAY)).toBe('rotate');
    });

    it('accepts the token just replaced during the leeway (inclusive), without rotating again', () => {
      const rotated = family({ currentJti: B, previousJti: A, rotatedAt: at(100) });
      expect(judgeRefresh(rotated, A, at(100), LEEWAY)).toBe('grace');
      expect(judgeRefresh(rotated, A, at(130), LEEWAY)).toBe('grace');
    });

    it('treats the replaced token as reused once the leeway is over', () => {
      const rotated = family({ currentJti: B, previousJti: A, rotatedAt: at(100) });
      expect(judgeRefresh(rotated, A, at(131), LEEWAY)).toBe('reuse');
    });

    it('treats any older token as reused, even right after a rotation', () => {
      const rotated = family({ currentJti: C, previousJti: B, rotatedAt: at(100) });
      expect(judgeRefresh(rotated, A, at(101), LEEWAY)).toBe('reuse');
    });

    it('never grants the grace without a rotation date, nor with a zero leeway after the instant', () => {
      expect(judgeRefresh(family({ currentJti: B, previousJti: A }), A, at(1), LEEWAY)).toBe('reuse');
      const rotated = family({ currentJti: B, previousJti: A, rotatedAt: at(100) });
      expect(judgeRefresh(rotated, A, at(101), 0)).toBe('reuse');
    });

    it('refuses unknown, revoked and expired families before looking at the jti', () => {
      expect(judgeRefresh(null, A, at(1), LEEWAY)).toBe('invalid');
      expect(judgeRefresh(family({ revokedAt: at(10) }), A, at(20), LEEWAY)).toBe('invalid');
      expect(judgeRefresh(family({ expiresAt: at(50) }), A, at(50), LEEWAY)).toBe('invalid');
      expect(judgeRefresh(family({ expiresAt: at(50) }), A, at(49), LEEWAY)).toBe('rotate');
    });
  });

  describe('refreshFamilyChanges', () => {
    it('rotation keeps the replaced jti as previous and slides the expiry', () => {
      expect(refreshFamilyChanges(family(), 'rotate', at(60), TTL, B)).toEqual({
        previousJti: A,
        currentJti: B,
        rotatedAt: at(60),
        lastUsedAt: at(60),
        expiresAt: at(60 + TTL),
      });
    });

    it('the grace path keeps both jtis and the rotation date', () => {
      const rotated = family({ currentJti: B, previousJti: A, rotatedAt: at(100) });
      expect(refreshFamilyChanges(rotated, 'grace', at(110), TTL, C)).toEqual({
        lastUsedAt: at(110),
        expiresAt: at(110 + TTL),
      });
    });

    it('reuse revokes the family; invalid changes nothing', () => {
      expect(refreshFamilyChanges(family(), 'reuse', at(5), TTL, B)).toEqual({ revokedAt: at(5) });
      expect(refreshFamilyChanges(family(), 'invalid', at(5), TTL, B)).toEqual({});
    });
  });

  it('two tabs refreshing together both stay signed in; a replay later kills the family', () => {
    // Tab 1 refreshes with A: rotation to B.
    let step = exchange(family(), A, at(600), B);
    expect(step.verdict).toBe('rotate');
    // Tab 2 sent A at the same time: it gets the current jti (B) back, no second rotation.
    step = exchange(step.state, A, at(602), C);
    expect(step.verdict).toBe('grace');
    expect(step.state.currentJti).toBe(B);
    // Later, B rotates normally to C.
    step = exchange(step.state, B, at(1200), C);
    expect(step.verdict).toBe('rotate');
    expect(step.state).toMatchObject({ currentJti: C, previousJti: B });
    // A stolen copy of A shows up: the whole family is revoked...
    step = exchange(step.state, A, at(1500), '00000000-0000-4000-8000-000000000000');
    expect(step.verdict).toBe('reuse');
    expect(step.state.revokedAt).toEqual(at(1500));
    // ...including the legitimate newest token.
    expect(exchange(step.state, C, at(1501), A).verdict).toBe('invalid');
  });

  describe('refreshClaims', () => {
    const payload = {
      sub: USER,
      role: Role.MEMBER,
      email: 'membre@example.com',
      name: 'Membre Test',
      type: 'refresh' as const,
      ver: 3,
      fam: FAMILY,
      jti: A,
    };

    it('reads the claims of a refresh token', () => {
      expect(refreshClaims(payload)).toEqual({ sub: USER, ver: 3, fam: FAMILY, jti: A });
    });

    it('refuses tokens signed before rotation existed (no fam / jti)', () => {
      expect(refreshClaims({ ...payload, fam: undefined, jti: undefined })).toBeNull();
      expect(refreshClaims({ ...payload, jti: undefined })).toBeNull();
    });

    it('refuses access tokens, missing versions and malformed ids', () => {
      expect(refreshClaims({ ...payload, type: 'access' })).toBeNull();
      expect(refreshClaims({ ...payload, ver: undefined })).toBeNull();
      expect(refreshClaims({ ...payload, fam: "1' OR '1'='1" })).toBeNull();
      expect(refreshClaims({ ...payload, sub: 'not-a-uuid' })).toBeNull();
      expect(refreshClaims(null)).toBeNull();
    });
  });
});
