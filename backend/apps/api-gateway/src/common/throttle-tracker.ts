import { AuthUser } from '@app/common';

/**
 * Rate-limit bucket of a request: the signed-in user ("user:<id>", req.user set by the AuthGuard), so
 * callers sharing an address (gym Wi-Fi, carrier NAT) never use up each other's limits; anonymous
 * requests (@Public routes such as login or the trial form) are counted per client address.
 */
export function throttleTracker(user: unknown, ip: string): string {
  const id = (user as Partial<AuthUser> | null | undefined)?.id;
  return typeof id === 'string' && id !== '' ? `user:${id}` : ip;
}
