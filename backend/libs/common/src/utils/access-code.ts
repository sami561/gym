import { createHmac, timingSafeEqual } from 'crypto';
import { ACCESS_CODE_PERIOD_SECONDS } from '../contracts/access.contracts';

/**
 * Rotating QR access code shown by the mobile app: MLR1.<memberCode>.<step>.<sig>
 *   step = floor(unixSeconds / 30)
 *   sig  = hex(HMAC-SHA256(key = member access secret (utf8), msg = "<memberCode>.<step>"))[0..32]
 * The app computes it offline from GET /api/me/access-key; access-service verifies it.
 */
export const ACCESS_CODE_PREFIX = 'MLR1';

export interface ParsedAccessCode {
  memberCode: string;
  step: number;
  sig: string;
}

export function accessStep(nowMs: number = Date.now(), period = ACCESS_CODE_PERIOD_SECONDS): number {
  return Math.floor(nowMs / 1000 / period);
}

export function signAccessCode(memberCode: string, secret: string, step: number): string {
  return createHmac('sha256', secret).update(`${memberCode}.${step}`).digest('hex').slice(0, 32);
}

export function buildAccessCode(memberCode: string, secret: string, nowMs: number = Date.now()): string {
  const step = accessStep(nowMs);
  return `${ACCESS_CODE_PREFIX}.${memberCode}.${step}.${signAccessCode(memberCode, secret, step)}`;
}

export function parseAccessCode(code: string): ParsedAccessCode | null {
  const parts = code.trim().split('.');
  if (parts.length !== 4 || parts[0] !== ACCESS_CODE_PREFIX) return null;
  const [, memberCode, rawStep, sig] = parts;
  const step = Number(rawStep);
  if (!/^[A-Z0-9-]{3,24}$/.test(memberCode)) return null;
  if (!/^\d{1,12}$/.test(rawStep) || !Number.isSafeInteger(step)) return null;
  if (!/^[0-9a-f]{32}$/.test(sig)) return null;
  return { memberCode, step, sig };
}

/** True when the signature matches and the step is within ±tolerance periods of now. */
export function verifyAccessCode(
  parsed: ParsedAccessCode,
  secret: string,
  nowMs: number = Date.now(),
  tolerance = 1,
): boolean {
  if (Math.abs(parsed.step - accessStep(nowMs)) > tolerance) return false;
  const expected = Buffer.from(signAccessCode(parsed.memberCode, secret, parsed.step));
  const provided = Buffer.from(parsed.sig);
  return expected.length === provided.length && timingSafeEqual(expected, provided);
}
