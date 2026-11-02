import { fromMillimes, round3, toMillimes } from './money';

describe('money in millimes (1 TND = 1000 millimes)', () => {
  it('converts TND to whole millimes without float drift', () => {
    expect(toMillimes(89.9)).toBe(89_900);
    expect(toMillimes(0.1 + 0.2)).toBe(300);
    expect(toMillimes(1.2 * 3)).toBe(3_600);
    expect(toMillimes(0)).toBe(0);
  });

  it('rounds half a millime away from zero, symmetrically', () => {
    expect(toMillimes(1.0005)).toBe(1_001);
    expect(toMillimes(-1.0005)).toBe(-1_001);
    expect(toMillimes(1.2345)).toBe(1_235);
    expect(toMillimes(0.0004)).toBe(0);
  });

  it('converts back to TND', () => {
    expect(fromMillimes(183_400)).toBe(183.4);
    expect(fromMillimes(-1)).toBe(-0.001);
  });

  it('rounds amounts to 3 decimals', () => {
    expect(round3(0.1 + 0.2)).toBe(0.3);
    expect(round3(14.9850001)).toBe(14.985);
    expect(round3(-0.0005)).toBe(-0.001);
  });
});
