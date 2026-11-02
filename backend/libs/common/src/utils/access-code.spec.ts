import {
  ACCESS_CODE_PREFIX,
  accessStep,
  buildAccessCode,
  parseAccessCode,
  signAccessCode,
  verifyAccessCode,
} from './access-code';

// Same reference vectors as mobile/src/lib/accessCode.test.ts: the app builds the code offline and
// access-service verifies it with this module, so both must produce exactly these strings.
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
    label: 'key longer than a SHA-256 block',
    memberCode: 'MEL-12345',
    secret: 'k'.repeat(100),
    nowMs: Date.UTC(2027, 0, 1),
    code: 'MLR1.MEL-12345.59958720.91790872865eaf0c42ee17dedce46863',
  },
  {
    label: 'non-ASCII key (UTF-8)',
    memberCode: 'MEL-00007',
    secret: 'clé-secrète-مفتاح',
    nowMs: Date.UTC(2026, 5, 15, 12, 0, 29, 999),
    code: 'MLR1.MEL-00007.59384160.378b9b9bcd2d73bcbf26d701f3170af3',
  },
];

describe('rotating QR access code (MLR1.<memberCode>.<step>.<sig>)', () => {
  it.each(VECTORS)('builds the reference code: $label', ({ memberCode, secret, nowMs, code }) => {
    expect(buildAccessCode(memberCode, secret, nowMs)).toBe(code);
  });

  it('changes step every 30 seconds', () => {
    expect(accessStep(STEP_START)).toBe(59_787_000);
    expect(accessStep(STEP_START + 29_999)).toBe(59_787_000);
    expect(accessStep(STEP_START + 30_000)).toBe(59_787_001);
    expect(accessStep(STEP_START - 1)).toBe(59_786_999);
  });

  it('signs with 32 lowercase hex characters', () => {
    expect(signAccessCode('MEL-00042', SECRET, 59_787_000)).toBe('66e45c92bec107ebfcdba48319c6b2e5');
  });

  describe('parseAccessCode', () => {
    it('splits a well-formed code, surrounding spaces included', () => {
      expect(parseAccessCode(`  ${VECTORS[0].code}\n`)).toEqual({
        memberCode: 'MEL-00042',
        step: 59_787_000,
        sig: '66e45c92bec107ebfcdba48319c6b2e5',
      });
      expect(ACCESS_CODE_PREFIX).toBe('MLR1');
    });

    it.each([
      ['another prefix', 'MLR2.MEL-00042.59787000.66e45c92bec107ebfcdba48319c6b2e5'],
      ['a missing part', 'MLR1.MEL-00042.66e45c92bec107ebfcdba48319c6b2e5'],
      ['an extra part', 'MLR1.MEL-00042.59787000.66e45c92bec107ebfcdba48319c6b2e5.x'],
      ['a lower-case member code', 'MLR1.mel-00042.59787000.66e45c92bec107ebfcdba48319c6b2e5'],
      ['a member code too short', 'MLR1.ME.59787000.66e45c92bec107ebfcdba48319c6b2e5'],
      ['a member code too long', `MLR1.${'M'.repeat(25)}.59787000.66e45c92bec107ebfcdba48319c6b2e5`],
      ['a negative step', 'MLR1.MEL-00042.-59787000.66e45c92bec107ebfcdba48319c6b2e5'],
      ['a step of 13 digits', 'MLR1.MEL-00042.1234567890123.66e45c92bec107ebfcdba48319c6b2e5'],
      ['an upper-case signature', 'MLR1.MEL-00042.59787000.66E45C92BEC107EBFCDBA48319C6B2E5'],
      ['a short signature', 'MLR1.MEL-00042.59787000.66e45c92bec107ebfcdba48319c6b2e'],
      ['a random QR code', 'https://www.instagram.com/gymmeliora'],
    ])('rejects %s', (_label, code) => {
      expect(parseAccessCode(code)).toBeNull();
    });
  });

  describe('verifyAccessCode', () => {
    const parsed = parseAccessCode(VECTORS[0].code)!;

    it('accepts the current step and one step of clock drift either way', () => {
      expect(verifyAccessCode(parsed, SECRET, STEP_START + 10_000)).toBe(true);
      expect(verifyAccessCode(parsed, SECRET, STEP_START + 30_000)).toBe(true); // shown just before the rotation
      expect(verifyAccessCode(parsed, SECRET, STEP_START - 30_000)).toBe(true); // phone clock 30 s ahead
    });

    it('rejects codes two steps old or ahead', () => {
      expect(verifyAccessCode(parsed, SECRET, STEP_START + 60_000)).toBe(false);
      expect(verifyAccessCode(parsed, SECRET, STEP_START - 30_001)).toBe(false);
    });

    it('honours a stricter tolerance', () => {
      expect(verifyAccessCode(parsed, SECRET, STEP_START + 30_000, 0)).toBe(false);
      expect(verifyAccessCode(parsed, SECRET, STEP_START + 29_999, 0)).toBe(true);
    });

    it('rejects another secret, another member code or a tampered signature', () => {
      expect(verifyAccessCode(parsed, 'b'.repeat(64), STEP_START)).toBe(false);
      expect(verifyAccessCode({ ...parsed, memberCode: 'MEL-00043' }, SECRET, STEP_START)).toBe(false);
      expect(verifyAccessCode({ ...parsed, sig: `${parsed.sig.slice(0, 31)}0` }, SECRET, STEP_START)).toBe(false);
      expect(verifyAccessCode({ ...parsed, sig: parsed.sig.slice(0, 30) }, SECRET, STEP_START)).toBe(false);
    });
  });
});
