import { JwtPayload, Role } from '@app/common';
import { liveSessionTtl } from './live-session';

const now = Date.UTC(2026, 10, 2, 9, 0, 0);
const exp = now / 1000 + 900;
const token = (extra: Partial<JwtPayload> & { exp?: unknown }) => ({
  sub: 'u1',
  email: 'staff@meliora.tn',
  name: 'Staff',
  role: Role.STAFF,
  type: 'access' as const,
  exp,
  ...extra,
});

describe('liveSessionTtl', () => {
  it('keeps an ADMIN / STAFF access token connected until it expires', () => {
    expect(liveSessionTtl(token({}), now)).toBe(900_000);
    expect(liveSessionTtl(token({ role: Role.ADMIN }), now + 60_000)).toBe(840_000);
  });

  it('refuses refresh tokens and non-staff roles', () => {
    expect(liveSessionTtl(token({ type: 'refresh' }), now)).toBeNull();
    expect(liveSessionTtl(token({ role: Role.COACH }), now)).toBeNull();
    expect(liveSessionTtl(token({ role: Role.MEMBER }), now)).toBeNull();
    expect(liveSessionTtl(token({ type: undefined }), now)).toBeNull();
  });

  it('refuses tokens without a usable expiry or already expired', () => {
    expect(liveSessionTtl(token({ exp: undefined }), now)).toBeNull();
    expect(liveSessionTtl(token({ exp: '1893456000' }), now)).toBeNull();
    expect(liveSessionTtl(token({ exp: now / 1000 }), now)).toBeNull();
  });

  it('stays within the setTimeout range for very long tokens', () => {
    expect(liveSessionTtl(token({ exp: now / 1000 + 90 * 86_400 }), now)).toBe(2_147_483_647);
  });
});
