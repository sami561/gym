import { Controller } from '@nestjs/common';
import { MessagePattern, Payload } from '@nestjs/microservices';
import { CreateExerciseRequest, ExerciseDto, IdRequest, OkResult, PATTERNS, UpdateExerciseRequest } from '@app/common';
import { ExercisesService, ListExercisesRequest } from './exercises.service';

@Controller()
export class ExercisesController {
  constructor(private readonly exercises: ExercisesService) {}

  @MessagePattern(PATTERNS.exercises.list)
  list(@Payload() request: ListExercisesRequest): Promise<ExerciseDto[]> {
    return this.exercises.list(request ?? {});
  }

  @MessagePattern(PATTERNS.exercises.create)
  create(@Payload() request: CreateExerciseRequest): Promise<ExerciseDto> {
    return this.exercises.create(request);
  }

  @MessagePattern(PATTERNS.exercises.update)
  update(@Payload() request: UpdateExerciseRequest): Promise<ExerciseDto> {
    return this.exercises.update({ id: request.id, data: request.data ?? {} });
  }

  @MessagePattern(PATTERNS.exercises.remove)
  remove(@Payload() request: IdRequest): Promise<OkResult> {
    return this.exercises.remove(request);
  }
}
