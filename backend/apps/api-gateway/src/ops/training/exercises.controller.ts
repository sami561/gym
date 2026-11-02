import { Body, Controller, Delete, Get, Param, ParseUUIDPipe, Patch, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { ExerciseDto, ListExercisesRequest, PATTERNS, Role, Roles, RpcClient } from '@app/common';
import { CreateExerciseDto, ListExercisesQuery, UpdateExerciseDto } from './training.dto';

@ApiTags('Entraînement — exercices')
@ApiBearerAuth()
@Roles(Role.ADMIN, Role.STAFF, Role.COACH)
@Controller('exercises')
export class ExercisesController {
  constructor(private readonly rpc: RpcClient) {}

  @Get()
  list(@Query() q: ListExercisesQuery) {
    return this.rpc.send<ExerciseDto[], ListExercisesRequest>(PATTERNS.exercises.list, q);
  }

  @Post()
  create(@Body() dto: CreateExerciseDto) {
    return this.rpc.send<ExerciseDto>(PATTERNS.exercises.create, dto);
  }

  @Patch(':id')
  update(@Param('id', ParseUUIDPipe) id: string, @Body() dto: UpdateExerciseDto) {
    return this.rpc.send<ExerciseDto>(PATTERNS.exercises.update, { id, data: dto });
  }

  @Delete(':id')
  remove(@Param('id', ParseUUIDPipe) id: string) {
    return this.rpc.send<{ ok: true }>(PATTERNS.exercises.remove, { id });
  }
}
