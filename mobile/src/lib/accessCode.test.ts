import { describe, expect, it, jest } from '@jest/globals';
import { createHmac } from '@/test/node';
import { ACCESS_CODE_PREFIX, accessStep, buildAccessCode, signAccessCode } from './accessCode';

/**
 * Independent oracle: the backend algorithm (backend/libs/common/src/utils/access-code.ts) on Node's
 * crypto. access-service verifies codes with it, so the app must produce exactly the same string.
 */
function backendCode(memberCode: string, secret: string, nowMs: number, period = 30): string {
  const step = Math.floor(nowMs / 1000 / period);
  const sig = createHmac('sha256', secret).update(`${memberCode}.${step}`).digest('hex').slice(0, 32);
  return `MLR1.${memberCode}.${step}.${sig}`;
}

/** What access-service's parseAccessCode accepts. */
const ACCEPTED_BY_BACKEND = /^MLR1\.[A-Z0-9-]{3,24}\.\d{1,12}\.[0-9a-f]{32}$/;

// Production secrets are randomSecret(): 32 random bytes in hex, a 64-byte key (one SHA-256 block).
const SECRET = '9f86d081884c7d659a2feaa0c55ad015a3bf4f1b2b0b822cd15d6c15b0f00a08';
// 2 Nov 2026 09:00:00 UTC, the first millisecond of step 59787000.
const STEP_START = Date.UTC(2026, 10, 2, 9, 0, 0);

const VECTORS = [
  {
    label: 'production-shaped secret',
    memberCode: 'MEL-00042',
    secret: SECRET,
    nowMs: STEP_START,
    code: 'MLR1.MEL-00042.59787000.66e45c92bec107ebfcdba48319c6b2e5',
  },
  {
    label: 'one millisecond before the step boundary',
    memberCode: 'MEL-00042',
    secret: SECRET,
    nowMs: STEP_START - 1,
    code: 'MLR1.MEL-00042.59786999.2ebf1ff9092dc7cd93f098862541ce08',
  },
  {
    label: 'middle of a step',
    memberCode: 'MEL-00001',
    secret: SECRET,
    nowMs: Date.UTC(2026, 10, 2, 17, 30, 15),
    code: 'MLR1.MEL-00001.59788020.a9e43c61a2cf06a3194b5c0699a320a2',
  },
  {
    label: 'key longer than a SHA-256 block (hashed first)',
    memberCode: 'MEL-12345',
    secret: 'k'.repeat(100),
    nowMs: Date.UTC(2027, 0, 1),
    code: 'MLR1.MEL-12345.59958720.91790872865eaf0c42ee17dedce46863',
  },
  {
    label: 'key of 40 characters but 80 UTF-8 bytes',
    memberCode: 'MEL-00008',
    secret: 'é'.repeat(40),
    nowMs: Date.UTC(2026, 5, 15, 12, 0, 30),
    code: 'MLR1.MEL-00008.59384161.9396486ed6deaab077498162bd7075b3',
  },
  {
    label: 'non-ASCII key (UTF-8 encoded like the backend)',
    memberCode: 'MEL-00007',
    secret: 'clé-secrète-مفتاح',
    nowMs: Date.UTC(2026, 5, 15, 12, 0, 29, 999),
    code: 'MLR1.MEL-00007.59384160.378b9b9bcd2d73bcbf26d701f3170af3',
  },
];

/** Small seeded PRNG (mulberry32) so the generated cases are the same on every run. */
function seeded(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

describe('buildAccessCode', () => {
  it.each(VECTORS)('matches the reference vector: $label', ({ memberCode, secret, nowMs, code }) => {
    expect(backendCode(memberCode, secret, nowMs)).toBe(code);
    expect(buildAccessCode(memberCode, secret, nowMs).code).toBe(code);
  });

  it('matches the backend for generated member codes, secrets (0-130 chars) and times', () => {
    const random = seeded(2026);
    const chars = [...'0123456789abcdefABCDEF-_.éèçمفتاح🔑'];
    for (let i = 0; i < 300; i++) {
      const memberCode = `MEL-${String(Math.floor(random() * 100_000)).padStart(5, '0')}`;
      const secret = Array.from({ length: Math.floor(random() * 131) }, () => chars[Math.floor(random() * chars.length)]).join('');
      const nowMs = Math.floor(random() * Date.UTC(2100, 0, 1));
      expect(buildAccessCode(memberCode, secret, nowMs).code).toBe(backendCode(memberCode, secret, nowMs));
    }
  });

  it('produces codes that access-service can parse', () => {
    for (const memberCode of ['MEL-00001', 'MEL-99999', 'MEL-123456']) {
      expect(buildAccessCode(memberCode, SECRET, STEP_START).code).toMatch(ACCEPTED_BY_BACKEND);
    }
  });

  it('is made of the prefix, the member code, the decimal step and a 128-bit hex signature', () => {
    const { code, step } = buildAccessCode('MEL-00042', SECRET, STEP_START);
    const [prefix, memberCode, rawStep, sig] = code.split('.');
    expect(code.split('.')).toHaveLength(4);
    expect(prefix).toBe(ACCESS_CODE_PREFIX);
    expect(memberCode).toBe('MEL-00042');
    expect(rawStep).toBe(String(step));
    expect(sig).toMatch(/^[0-9a-f]{32}$/);
    expect(code).toBe(backendCode('MEL-00042', SECRET, STEP_START));
  });

  it('uses the current time by default', () => {
    jest.spyOn(Date, 'now').mockReturnValue(STEP_START + 12_345);
    expect(buildAccessCode('MEL-00042', SECRET)).toEqual(buildAccessCode('MEL-00042', SECRET, STEP_START + 12_345));
  });
});

describe('rotation', () => {
  it('keeps the same code for the whole 30-second window', () => {
    const codes = [0, 1, 15_000, 29_999].map((offset) => buildAccessCode('MEL-00042', SECRET, STEP_START + offset).code);
    expect(new Set(codes).size).toBe(1);
  });

  it('changes the code exactly at the window boundary', () => {
    const before = buildAccessCode('MEL-00042', SECRET, STEP_START - 1);
    const after = buildAccessCode('MEL-00042', SECRET, STEP_START);
    expect(after.step).toBe(before.step + 1);
    expect(after.code).not.toBe(before.code);
    // The previous code expires at the very millisecond the next one becomes valid.
    expect(before.expiresAt).toBe(STEP_START);
  });

  it('expires at the end of the current window, never later than one period', () => {
    for (const offset of [0, 1, 15_000, 29_999]) {
      const now = STEP_START + offset;
      const { expiresAt } = buildAccessCode('MEL-00042', SECRET, now);
      expect(expiresAt).toBe(STEP_START + 30_000);
      expect(expiresAt - now).toBeGreaterThan(0);
      expect(expiresAt - now).toBeLessThanOrEqual(30_000);
    }
  });

  it('follows a custom period from the access key', () => {
    // STEP_START is a whole minute: +45 s is still the first 60-second window.
    const now = STEP_START + 45_000;
    const { code, step, expiresAt } = buildAccessCode('MEL-00042', SECRET, now, 60);
    expect(step).toBe(STEP_START / 60_000);
    expect(expiresAt).toBe(STEP_START + 60_000);
    expect(code).toBe(backendCode('MEL-00042', SECRET, now, 60));
    expect(code).not.toBe(buildAccessCode('MEL-00042', SECRET, now).code);
  });
});

describe('accessStep', () => {
  it('counts whole 30-second periods since the Unix epoch', () => {
    expect(accessStep(0)).toBe(0);
    expect(accessStep(29_999)).toBe(0);
    expect(accessStep(30_000)).toBe(1);
    expect(accessStep(STEP_START)).toBe(59_787_000);
    expect(accessStep(STEP_START - 1)).toBe(59_786_999);
  });

  it('honours the period argument', () => {
    expect(accessStep(59_999, 60)).toBe(0);
    expect(accessStep(60_000, 60)).toBe(1);
  });
});

describe('signAccessCode', () => {
  it('depends on the member code, the secret and the step', () => {
    const base = signAccessCode('MEL-00042', SECRET, 59_787_000);
    expect(signAccessCode('MEL-00043', SECRET, 59_787_000)).not.toBe(base);
    expect(signAccessCode('MEL-00042', `${SECRET.slice(0, -1)}9`, 59_787_000)).not.toBe(base);
    expect(signAccessCode('MEL-00042', SECRET, 59_787_001)).not.toBe(base);
  });
});
