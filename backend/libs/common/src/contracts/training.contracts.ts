export enum MuscleGroup {
  CHEST = 'CHEST',
  BACK = 'BACK',
  SHOULDERS = 'SHOULDERS',
  ARMS = 'ARMS',
  LEGS = 'LEGS',
  GLUTES = 'GLUTES',
  CORE = 'CORE',
  CARDIO = 'CARDIO',
  FULL_BODY = 'FULL_BODY',
}

export enum PtSessionStatus {
  SCHEDULED = 'SCHEDULED',
  DONE = 'DONE',
  CANCELLED = 'CANCELLED',
  NO_SHOW = 'NO_SHOW',
}

export interface ExerciseDto {
  id: string;
  name: string;
  muscleGroup: MuscleGroup;
  equipment: string | null;
  description: string | null;
  videoUrl: string | null;
}

export interface CreateExerciseRequest {
  name: string;
  muscleGroup: MuscleGroup;
  equipment?: string | null;
  description?: string | null;
  videoUrl?: string | null;
}

export interface UpdateExerciseRequest {
  id: string;
  data: Partial<CreateExerciseRequest>;
}

export interface ProgramExercise {
  exerciseId: string | null;
  name: string;
  sets: number;
  reps: string;
  restSeconds: number | null;
  weightKg: number | null;
  notes: string | null;
}

export interface ProgramDay {
  /** "Jour 1 — Push", "Lundi"... */
  label: string;
  exercises: ProgramExercise[];
}

export interface WorkoutProgramDto {
  id: string;
  memberId: string;
  memberName: string;
  coachId: string | null;
  coachName: string | null;
  title: string;
  goal: string | null;
  startDate: string;
  weeks: number;
  days: ProgramDay[];
  isActive: boolean;
  createdAt: string;
}

export interface CreateProgramRequest {
  memberId: string;
  coachId?: string | null;
  title: string;
  goal?: string | null;
  startDate: string;
  weeks: number;
  days: ProgramDay[];
}

export interface UpdateProgramRequest {
  id: string;
  data: Partial<Omit<CreateProgramRequest, 'memberId'>> & { isActive?: boolean };
}

export interface ListProgramsRequest {
  memberId?: string;
  coachId?: string;
  activeOnly?: boolean;
}

export interface MeasurementDto {
  id: string;
  memberId: string;
  /** YYYY-MM-DD */
  date: string;
  weightKg: number | null;
  heightCm: number | null;
  bodyFatPct: number | null;
  musclePct: number | null;
  chestCm: number | null;
  waistCm: number | null;
  hipsCm: number | null;
  armCm: number | null;
  thighCm: number | null;
  /** Computed from the latest known height. */
  bmi: number | null;
  notes: string | null;
  recordedByName: string | null;
}

export interface CreateMeasurementRequest {
  memberId: string;
  date?: string;
  weightKg?: number | null;
  heightCm?: number | null;
  bodyFatPct?: number | null;
  musclePct?: number | null;
  chestCm?: number | null;
  waistCm?: number | null;
  hipsCm?: number | null;
  armCm?: number | null;
  thighCm?: number | null;
  notes?: string | null;
  recordedByName?: string | null;
}

export interface ListMeasurementsRequest {
  memberId: string;
}

export interface PtSessionDto {
  id: string;
  coachId: string;
  coachName: string;
  memberId: string;
  memberName: string;
  startsAt: string;
  endsAt: string;
  status: PtSessionStatus;
  price: number;
  notes: string | null;
}

export interface CreatePtSessionRequest {
  coachId: string;
  memberId: string;
  startsAt: string;
  endsAt: string;
  price: number;
  notes?: string | null;
}

export interface UpdatePtSessionRequest {
  id: string;
  data: Partial<Omit<CreatePtSessionRequest, 'memberId'>> & { status?: PtSessionStatus };
}

export interface ListPtSessionsRequest {
  from?: string;
  to?: string;
  coachId?: string;
  memberId?: string;
}

export interface CoachPtSummaryRequest {
  coachId: string;
  /** YYYY-MM */
  period: string;
}

export interface CoachPtSummary {
  coachId: string;
  period: string;
  sessions: number;
  revenue: number;
}

export interface TrainingStats {
  activePrograms: number;
  ptSessionsThisMonth: number;
  ptRevenueThisMonth: number;
}
