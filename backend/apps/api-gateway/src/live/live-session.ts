import { JwtPayload, STAFF_ROLES } from '@app/common';

/** setTimeout ceiling (~24.8 days): a longer delay would fire at once. */
const MAX_TIMER_MS = 2_147_483_647;

/**
 * How long a verified token may keep the live feed open, in ms, or null to refuse it: ADMIN / STAFF
 * access tokens only, until their `exp`. The socket is then closed; the client refreshes its token and
 * reconnects, which fails once the session is revoked or the account deactivated.
 */
export function liveSessionTtl(payload: Partial<JwtPayload> & { exp?: unknown }, nowMs: number): number | null {
  if (payload.type !== 'access' || !payload.role || !STAFF_ROLES.includes(payload.role)) return null;
  if (typeof payload.exp !== 'number' || !Number.isFinite(payload.exp)) return null;
  const remaining = payload.exp * 1000 - nowMs;
  return remaining > 0 ? Math.min(remaining, MAX_TIMER_MS) : null;
}
