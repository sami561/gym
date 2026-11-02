/** Body mass index = weight (kg) / height (m)², rounded to 1 decimal. */
export function computeBmi(weightKg: number | null, heightCm: number | null): number | null {
  if (!weightKg || !heightCm || weightKg <= 0 || heightCm <= 0) return null;
  const meters = heightCm / 100;
  return Math.round((weightKg / (meters * meters)) * 10) / 10;
}

/** Height of the most recent row that has one (rows sorted oldest first). */
export function latestKnownHeight(rows: { heightCm: number | null }[]): number | null {
  for (let index = rows.length - 1; index >= 0; index -= 1) {
    if (rows[index].heightCm) return rows[index].heightCm;
  }
  return null;
}

/** BMI of each row, using the member's latest known height when the row has none. */
export function withBmi<T extends { weightKg: number | null; heightCm: number | null }>(
  rows: T[],
): (T & { bmi: number | null })[] {
  const fallbackHeight = latestKnownHeight(rows);
  return rows.map((row) => ({ ...row, bmi: computeBmi(row.weightKg, row.heightCm ?? fallbackHeight) }));
}
