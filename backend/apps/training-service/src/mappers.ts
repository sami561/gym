import { ExerciseDto, MeasurementDto, PtSessionDto, WorkoutProgramDto } from '@app/common';
import { Exercise } from './exercises/exercise.entity';
import { WorkoutProgram } from './programs/workout-program.entity';
import { Measurement } from './measurements/measurement.entity';
import { PtSession } from './pt-sessions/pt-session.entity';

export function toExerciseDto(exercise: Exercise): ExerciseDto {
  return {
    id: exercise.id,
    name: exercise.name,
    muscleGroup: exercise.muscleGroup,
    equipment: exercise.equipment,
    description: exercise.description,
    videoUrl: exercise.videoUrl,
  };
}

export function toProgramDto(program: WorkoutProgram): WorkoutProgramDto {
  return {
    id: program.id,
    memberId: program.memberId,
    memberName: program.memberName,
    coachId: program.coachId,
    coachName: program.coachName,
    title: program.title,
    goal: program.goal,
    startDate: program.startDate,
    weeks: program.weeks,
    days: program.days ?? [],
    isActive: program.isActive,
    createdAt: program.createdAt.toISOString(),
  };
}

export function toMeasurementDto(measurement: Measurement, bmi: number | null): MeasurementDto {
  return {
    id: measurement.id,
    memberId: measurement.memberId,
    date: measurement.date,
    weightKg: measurement.weightKg,
    heightCm: measurement.heightCm,
    bodyFatPct: measurement.bodyFatPct,
    musclePct: measurement.musclePct,
    chestCm: measurement.chestCm,
    waistCm: measurement.waistCm,
    hipsCm: measurement.hipsCm,
    armCm: measurement.armCm,
    thighCm: measurement.thighCm,
    bmi,
    notes: measurement.notes,
    recordedByName: measurement.recordedByName,
  };
}

export function toPtSessionDto(session: PtSession): PtSessionDto {
  return {
    id: session.id,
    coachId: session.coachId,
    coachName: session.coachName,
    memberId: session.memberId,
    memberName: session.memberName,
    startsAt: session.startsAt.toISOString(),
    endsAt: session.endsAt.toISOString(),
    status: session.status,
    price: session.price,
    notes: session.notes,
  };
}
