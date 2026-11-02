import {
  BadRequestException,
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
  OnApplicationBootstrap,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import {
  CreateExerciseRequest,
  ExerciseDto,
  IdRequest,
  ListExercisesRequest,
  MuscleGroup,
  OkResult,
  UpdateExerciseRequest,
} from '@app/common';
import { Exercise } from './exercise.entity';
import { EXERCISE_LIBRARY } from './exercises.seed';
import { toExerciseDto } from '../mappers';
import { likePattern, optionalText, requireText } from '../shared/validation';

@Injectable()
export class ExercisesService implements OnApplicationBootstrap {
  private readonly logger = new Logger(ExercisesService.name);

  constructor(@InjectRepository(Exercise) private readonly exercises: Repository<Exercise>) {}

  async onApplicationBootstrap(): Promise<void> {
    try {
      if ((await this.exercises.count()) > 0) return;
      await this.exercises.insert(EXERCISE_LIBRARY.map((exercise) => this.toEntity(exercise)));
      this.logger.log(`Seeded the exercise library (${EXERCISE_LIBRARY.length} exercises)`);
    } catch (err) {
      this.logger.warn(`Exercise library seed skipped: ${(err as Error).message}`);
    }
  }

  async list(request: ListExercisesRequest): Promise<ExerciseDto[]> {
    const query = this.exercises.createQueryBuilder('e');
    if (request.muscleGroup) query.andWhere('e.muscleGroup = :muscleGroup', { muscleGroup: request.muscleGroup });
    if (request.search?.trim()) query.andWhere('e.name ILIKE :search', { search: likePattern(request.search) });
    const rows = await query.orderBy('e.muscleGroup', 'ASC').addOrderBy('e.name', 'ASC').getMany();
    return rows.map(toExerciseDto);
  }

  async create(request: CreateExerciseRequest): Promise<ExerciseDto> {
    const entity = this.toEntity(request);
    await this.assertNameFree(entity.name);
    return toExerciseDto(await this.exercises.save(entity));
  }

  async update({ id, data }: UpdateExerciseRequest): Promise<ExerciseDto> {
    const exercise = await this.exercises.findOne({ where: { id } });
    if (!exercise) throw new NotFoundException('Exercice introuvable.');
    if (data.name !== undefined) {
      const name = requireText(data.name, "Le nom de l'exercice est obligatoire.");
      if (name.toLowerCase() !== exercise.name.toLowerCase()) await this.assertNameFree(name);
      exercise.name = name;
    }
    if (data.muscleGroup !== undefined) exercise.muscleGroup = requireMuscleGroup(data.muscleGroup);
    if (data.equipment !== undefined) exercise.equipment = optionalText(data.equipment);
    if (data.description !== undefined) exercise.description = optionalText(data.description);
    if (data.videoUrl !== undefined) exercise.videoUrl = optionalText(data.videoUrl);
    return toExerciseDto(await this.exercises.save(exercise));
  }

  /** Programs keep the exercise name in their own JSON, so deleting is always safe. */
  async remove({ id }: IdRequest): Promise<OkResult> {
    const result = await this.exercises.delete({ id });
    if (!result.affected) throw new NotFoundException('Exercice introuvable.');
    return { ok: true };
  }

  private toEntity(request: CreateExerciseRequest): Exercise {
    return this.exercises.create({
      name: requireText(request.name, "Le nom de l'exercice est obligatoire."),
      muscleGroup: requireMuscleGroup(request.muscleGroup),
      equipment: optionalText(request.equipment),
      description: optionalText(request.description),
      videoUrl: optionalText(request.videoUrl),
    });
  }

  private async assertNameFree(name: string): Promise<void> {
    const existing = await this.exercises
      .createQueryBuilder('e')
      .where('LOWER(e.name) = LOWER(:name)', { name })
      .getOne();
    if (existing) throw new ConflictException(`L'exercice « ${name} » existe déjà.`);
  }
}

function requireMuscleGroup(value: MuscleGroup): MuscleGroup {
  if (!Object.values(MuscleGroup).includes(value)) throw new BadRequestException('Groupe musculaire invalide.');
  return value;
}
