import { sha256 } from 'js-sha256';

/**
 * Rotating QR access code, identical to backend/libs/common/src/utils/access-code.ts:
 *   MLR1.<memberCode>.<step>.<sig>
 *   step = floor(unixSeconds / period)        (period = 30 s)
 *   sig  = hex(HMAC-SHA256(secret, "<memberCode>.<step>")).slice(0, 32)
 * Computed offline from the key returned by GET /api/me/access-key.
 */
export const ACCESS_CODE_PREFIX = 'MLR1';
export const DEFAULT_PERIOD_SECONDS = 30;

export interface AccessCode {
  code: string;
  step: number;
  /** Epoch ms when this code rotates. */
  expiresAt: number;
}

export function accessStep(nowMs: number = Date.now(), period = DEFAULT_PERIOD_SECONDS): number {
  return Math.floor(nowMs / 1000 / period);
}

export function signAccessCode(memberCode: string, secret: string, step: number): string {
  return sha256.hmac(secret, `${memberCode}.${step}`).slice(0, 32);
}

export function buildAccessCode(
  memberCode: string,
  secret: string,
  nowMs: number = Date.now(),
  period = DEFAULT_PERIOD_SECONDS,
): AccessCode {
  const step = accessStep(nowMs, period);
  return {
    code: `${ACCESS_CODE_PREFIX}.${memberCode}.${step}.${signAccessCode(memberCode, secret, step)}`,
    step,
    expiresAt: (step + 1) * period * 1000,
  };
}
