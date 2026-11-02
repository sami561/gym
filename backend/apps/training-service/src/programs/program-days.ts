import { BadRequestException } from '@nestjs/common';
import { ProgramDay, ProgramExercise } from '@app/common';
import { optionalMetric, optionalText } from '../shared/validation';

const MAX_DAYS = 14;
const MAX_EXERCISES_PER_DAY = 30;

/** Validates and normalises the program structure stored as JSON. */
export function normalizeDays(days: unknown): ProgramDay[] {
  if (!Array.isArray(days) || days.length === 0) {
    throw new BadRequestException('Le programme doit contenir au moins un jour.');
  }
  if (days.length > MAX_DAYS) throw new BadRequestException(`${MAX_DAYS} jours au maximum par programme.`);
  return days.map((day: Partial<ProgramDay> | null, index) => {
    const label = optionalText(day?.label) ?? `Jour ${index + 1}`;
    const exercises: unknown[] = Array.isArray(day?.exercises) ? day.exercises : [];
    if (exercises.length > MAX_EXERCISES_PER_DAY) {
      throw new BadRequestException(`« ${label} » : ${MAX_EXERCISES_PER_DAY} exercices au maximum.`);
    }
    return { label, exercises: exercises.map((exercise, position) => normalizeExercise(exercise, label, position)) };
  });
}

function normalizeExercise(raw: unknown, dayLabel: string, position: number): ProgramExercise {
  const value = (raw ?? {}) as Partial<Record<keyof ProgramExercise, unknown>>;
  const name = optionalText(value.name);
  if (!name) throw new BadRequestException(`« ${dayLabel} », exercice ${position + 1} : le nom est obligatoire.`);

  const sets = Number(value.sets);
  if (!Number.isInteger(sets) || sets < 1 || sets > 20) {
    throw new BadRequestException(`« ${name} » : le nombre de séries doit être un entier entre 1 et 20.`);
  }
  const reps = typeof value.reps === 'string' || typeof value.reps === 'number' ? String(value.reps).trim() : '';
  if (!reps) throw new BadRequestException(`« ${name} » : indiquez les répétitions (ex. 8-12 ou 30 s).`);

  const rest = optionalMetric(value.restSeconds, `« ${name} » : le repos (s)`, 0, 900);
  return {
    exerciseId: optionalText(value.exerciseId),
    name,
    sets,
    reps,
    restSeconds: rest === null ? null : Math.round(rest),
    weightKg: optionalMetric(value.weightKg, `« ${name} » : la charge (kg)`, 0, 500),
    notes: optionalText(value.notes),
  };
}
