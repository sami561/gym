import { BadRequestException } from '@nestjs/common';
import { normalizeDays } from './program-days';

describe('program days', () => {
  it('normalises labels, reps and optional fields', () => {
    const days = normalizeDays([
      { label: '  Push ', exercises: [{ name: ' Développé couché ', sets: 4, reps: '8-10', restSeconds: 90.4, weightKg: 60 }] },
      { label: '', exercises: [{ name: 'Squat', sets: 5, reps: 5 }] },
    ]);
    expect(days[0]).toEqual({
      label: 'Push',
      exercises: [{ exerciseId: null, name: 'Développé couché', sets: 4, reps: '8-10', restSeconds: 90, weightKg: 60, notes: null }],
    });
    expect(days[1].label).toBe('Jour 2');
    expect(days[1].exercises[0].reps).toBe('5');
  });

  it('rejects empty programs and invalid exercises', () => {
    expect(() => normalizeDays([])).toThrow(BadRequestException);
    expect(() => normalizeDays([{ label: 'A', exercises: [{ name: '', sets: 3, reps: '10' }] }])).toThrow(BadRequestException);
    expect(() => normalizeDays([{ label: 'A', exercises: [{ name: 'Curl', sets: 0, reps: '10' }] }])).toThrow(
      '« Curl » : le nombre de séries doit être un entier entre 1 et 20.',
    );
    expect(() => normalizeDays([{ label: 'A', exercises: [{ name: 'Curl', sets: 3, reps: ' ' }] }])).toThrow(BadRequestException);
  });

  it('refuses reps that are not text or a number instead of storing "[object Object]"', () => {
    const missingReps = '« Curl » : indiquez les répétitions (ex. 8-12 ou 30 s).';
    expect(() => normalizeDays([{ label: 'A', exercises: [{ name: 'Curl', sets: 3, reps: { min: 8, max: 12 } }] }])).toThrow(
      missingReps,
    );
    expect(() => normalizeDays([{ label: 'A', exercises: [{ name: 'Curl', sets: 3, reps: ['8', '12'] }] }])).toThrow(
      missingReps,
    );
    expect(() => normalizeDays([{ label: 'A', exercises: [{ name: 'Curl', sets: 3, reps: true }] }])).toThrow(missingReps);
  });
});
