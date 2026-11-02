import { JwtPayload } from '@app/common';

/** What is stored about one sign-in ("family"): see RefreshSession. */
export interface RefreshFamilyState {
  currentJti: string;
  previousJti: string | null;
  rotatedAt: Date | null;
  expiresAt: Date;
  revokedAt: Date | null;
  lastUsedAt: Date;
}

/**
 * - invalid: unknown, revoked or expired family → 401, nothing changes;
 * - rotate: the newest token of the family → it is replaced by a new one;
 * - grace: the token replaced less than the leeway ago (two tabs, a retried request) → a new pair
 *   carrying the current jti, without rotating again;
 * - reuse: any older token → it was copied: the whole family is revoked.
 */
export type RefreshVerdict = 'invalid' | 'rotate' | 'grace' | 'reuse';

export interface RefreshClaims {
  sub: string;
  ver: number;
  fam: string;
  jti: string;
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const isUuid = (value: unknown): value is string => typeof value === 'string' && UUID.test(value);

/**
 * Claims of a verified refresh token, or null for an access token and for tokens signed before
 * rotation existed (no fam / jti): their owners sign in again once.
 */
export function refreshClaims(payload: Partial<JwtPayload> | null | undefined): RefreshClaims | null {
  if (!payload || payload.type !== 'refresh') return null;
  const { sub, ver, fam, jti } = payload;
  if (typeof ver !== 'number' || !isUuid(sub) || !isUuid(fam) || !isUuid(jti)) return null;
  return { sub, ver, fam, jti };
}

export function judgeRefresh(
  family: RefreshFamilyState | null,
  jti: string,
  now: Date,
  leewaySeconds: number,
): RefreshVerdict {
  if (!family || family.revokedAt || family.expiresAt.getTime() <= now.getTime()) return 'invalid';
  if (jti === family.currentJti) return 'rotate';
  const sinceRotation = family.rotatedAt ? now.getTime() - family.rotatedAt.getTime() : Number.POSITIVE_INFINITY;
  if (jti === family.previousJti && sinceRotation <= leewaySeconds * 1000) return 'grace';
  return 'reuse';
}

/**
 * Column changes that go with a verdict (none for invalid). Every refresh token handed out pushes
 * the family's expiry to now + ttl, like today's sliding 30-day sessions.
 */
export function refreshFamilyChanges(
  family: RefreshFamilyState,
  verdict: RefreshVerdict,
  now: Date,
  ttlSeconds: number,
  newJti: string,
): Partial<RefreshFamilyState> {
  const expiresAt = new Date(now.getTime() + ttlSeconds * 1000);
  switch (verdict) {
    case 'rotate':
      return { previousJti: family.currentJti, currentJti: newJti, rotatedAt: now, lastUsedAt: now, expiresAt };
    case 'grace':
      return { lastUsedAt: now, expiresAt };
    case 'reuse':
      return { revokedAt: now };
    default:
      return {};
  }
}
