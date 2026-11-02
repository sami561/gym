import { Controller } from '@nestjs/common';
import { MessagePattern, Payload } from '@nestjs/microservices';
import {
  CreateProgramRequest,
  IdRequest,
  ListProgramsRequest,
  OkResult,
  PATTERNS,
  UpdateProgramRequest,
  WorkoutProgramDto,
} from '@app/common';
import { ProgramsService } from './programs.service';

@Controller()
export class ProgramsController {
  constructor(private readonly programs: ProgramsService) {}

  @MessagePattern(PATTERNS.programs.list)
  list(@Payload() request: ListProgramsRequest): Promise<WorkoutProgramDto[]> {
    return this.programs.list(request ?? {});
  }

  @MessagePattern(PATTERNS.programs.get)
  get(@Payload() request: IdRequest): Promise<WorkoutProgramDto> {
    return this.programs.get(request);
  }

  @MessagePattern(PATTERNS.programs.create)
  create(@Payload() request: CreateProgramRequest): Promise<WorkoutProgramDto> {
    return this.programs.create(request);
  }

  @MessagePattern(PATTERNS.programs.update)
  update(@Payload() request: UpdateProgramRequest): Promise<WorkoutProgramDto> {
    return this.programs.update({ id: request.id, data: request.data ?? {} });
  }

  @MessagePattern(PATTERNS.programs.remove)
  remove(@Payload() request: IdRequest): Promise<OkResult> {
    return this.programs.remove(request);
  }
}
