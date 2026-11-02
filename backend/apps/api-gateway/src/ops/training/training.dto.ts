import { OmitType, PartialType } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsBoolean,
  IsDateString,
  IsEnum,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  IsUrl,
  IsUUID,
  Length,
  Max,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';
import { MuscleGroup, PtSessionStatus } from '@app/common';
import { QueryBoolean } from '../query';

export class ListExercisesQuery {
  @IsOptional()
  @IsString()
  search?: string;

  @IsOptional()
  @IsEnum(MuscleGroup)
  muscleGroup?: MuscleGroup;
}

export class CreateExerciseDto {
  @IsString()
  @Length(1, 120)
  name: string;

  @IsEnum(MuscleGroup)
  muscleGroup: MuscleGroup;

  @IsOptional()
  @IsString()
  @MaxLength(80)
  equipment?: string;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  description?: string;

  @IsOptional()
  @IsUrl({ require_protocol: true, protocols: ['http', 'https'] }, { message: 'Lien vidéo invalide.' })
  videoUrl?: string;
}

export class UpdateExerciseDto extends PartialType(CreateExerciseDto) {}

export class ProgramExerciseInputDto {
  /** Exercise of the library, or null for a free-text exercise. */
  @IsOptional()
  @IsUUID()
  exerciseId?: string | null;

  @IsString()
  @Length(1, 120)
  name: string;

  @IsInt()
  @Min(1)
  @Max(20)
  sets: number;

  /** "10", "8-12", "45 s"... */
  @IsString()
  @Length(1, 20)
  reps: string;

  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(900)
  restSeconds?: number | null;

  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(500)
  weightKg?: number | null;

  @IsOptional()
  @IsString()
  @MaxLength(300)
  notes?: string | null;
}

export class ProgramDayInputDto {
  /** "Jour 1 — Push", "Lundi"... */
  @IsString()
  @Length(1, 60)
  label: string;

  @IsArray()
  @ArrayMaxSize(30)
  @ValidateNested({ each: true })
  @Type(() => ProgramExerciseInputDto)
  exercises: ProgramExerciseInputDto[];
}

export class ListProgramsQuery {
  @IsOptional()
  @IsUUID()
  memberId?: string;

  @IsOptional()
  @IsUUID()
  coachId?: string;

  @IsOptional()
  @QueryBoolean()
  activeOnly?: boolean;
}

export class CreateProgramDto {
  @IsUUID()
  memberId: string;

  /** Defaults to the current user when a coach creates the program. */
  @IsOptional()
  @IsUUID()
  coachId?: string;

  @IsString()
  @Length(1, 120)
  title: string;

  @IsOptional()
  @IsString()
  @MaxLength(300)
  goal?: string;

  /** YYYY-MM-DD */
  @IsDateString()
  startDate: string;

  @IsInt()
  @Min(1)
  @Max(52)
  weeks: number;

  @IsArray()
  @ArrayMinSize(1, { message: 'Ajoutez au moins une séance au programme.' })
  @ArrayMaxSize(14)
  @ValidateNested({ each: true })
  @Type(() => ProgramDayInputDto)
  days: ProgramDayInputDto[];
}

export class UpdateProgramDto extends PartialType(OmitType(CreateProgramDto, ['memberId'] as const)) {
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}

export class CreateMeasurementDto {
  /** YYYY-MM-DD, defaults to today. */
  @IsOptional()
  @IsDateString()
  date?: string;

  @IsOptional()
  @IsNumber()
  @Min(20)
  @Max(400)
  weightKg?: number;

  @IsOptional()
  @IsNumber()
  @Min(100)
  @Max(250)
  heightCm?: number;

  @IsOptional()
  @IsNumber()
  @Min(1)
  @Max(70)
  bodyFatPct?: number;

  @IsOptional()
  @IsNumber()
  @Min(1)
  @Max(90)
  musclePct?: number;

  @IsOptional()
  @IsNumber()
  @Min(30)
  @Max(250)
  chestCm?: number;

  @IsOptional()
  @IsNumber()
  @Min(30)
  @Max(250)
  waistCm?: number;

  @IsOptional()
  @IsNumber()
  @Min(30)
  @Max(250)
  hipsCm?: number;

  @IsOptional()
  @IsNumber()
  @Min(10)
  @Max(100)
  armCm?: number;

  @IsOptional()
  @IsNumber()
  @Min(20)
  @Max(150)
  thighCm?: number;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  notes?: string;
}

export class ListPtSessionsQuery {
  @IsOptional()
  @IsDateString()
  from?: string;

  @IsOptional()
  @IsDateString()
  to?: string;

  @IsOptional()
  @IsUUID()
  coachId?: string;

  @IsOptional()
  @IsUUID()
  memberId?: string;
}

export class CreatePtSessionDto {
  /** Defaults to the current user when a coach books the session. */
  @IsOptional()
  @IsUUID()
  coachId?: string;

  @IsUUID()
  memberId: string;

  @IsDateString()
  startsAt: string;

  @IsDateString()
  endsAt: string;

  /** Price of the session (TND). */
  @IsNumber()
  @Min(0)
  price: number;

  @IsOptional()
  @IsString()
  @MaxLength(1000)
  notes?: string;
}

export class UpdatePtSessionDto extends PartialType(OmitType(CreatePtSessionDto, ['memberId'] as const)) {
  @IsOptional()
  @IsEnum(PtSessionStatus)
  status?: PtSessionStatus;
}
