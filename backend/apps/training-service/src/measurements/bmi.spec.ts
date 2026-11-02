import { computeBmi, latestKnownHeight, withBmi } from './bmi';

describe('BMI', () => {
  it('computes weight / height² rounded to 1 decimal', () => {
    expect(computeBmi(80, 180)).toBe(24.7);
    expect(computeBmi(62.5, 165)).toBe(23);
    expect(computeBmi(null, 180)).toBeNull();
    expect(computeBmi(80, null)).toBeNull();
    expect(computeBmi(80, 0)).toBeNull();
  });

  it('uses the latest known height when a row has none', () => {
    const rows = [
      { date: '2026-01-05', weightKg: 90, heightCm: 178 },
      { date: '2026-02-05', weightKg: 86, heightCm: null },
      { date: '2026-03-05', weightKg: null, heightCm: 180 },
      { date: '2026-04-05', weightKg: 84, heightCm: null },
    ];
    expect(latestKnownHeight(rows)).toBe(180);
    expect(withBmi(rows).map((row) => row.bmi)).toEqual([28.4, 26.5, null, 25.9]);
  });

  it('returns null BMIs when no height is known', () => {
    expect(withBmi([{ weightKg: 70, heightCm: null }])[0].bmi).toBeNull();
  });
});
