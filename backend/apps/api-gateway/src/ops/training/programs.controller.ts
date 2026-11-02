import { Body, Controller, Delete, Get, Param, ParseUUIDPipe, Patch, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { AuthUser, CurrentUser, PATTERNS, ProgramDay, Role, Roles, RpcClient, WorkoutProgramDto } from '@app/common';
import { CreateProgramDto, ListProgramsQuery, ProgramDayInputDto, UpdateProgramDto } from './training.dto';

@ApiTags('Entraînement — programmes')
@ApiBearerAuth()
@Roles(Role.ADMIN, Role.STAFF, Role.COACH)
@Controller('programs')
export class ProgramsController {
  constructor(private readonly rpc: RpcClient) {}

  @Get()
  list(@Query() q: ListProgramsQuery) {
    return this.rpc.send<WorkoutProgramDto[]>(PATTERNS.programs.list, q);
  }

  @Post()
  create(@CurrentUser() user: AuthUser, @Body() dto: CreateProgramDto) {
    return this.rpc.send<WorkoutProgramDto>(PATTERNS.programs.create, {
      ...dto,
      // A coach creating a program is its coach unless another one is chosen.
      coachId: dto.coachId ?? (user.role === Role.COACH ? user.id : null),
      days: toProgramDays(dto.days),
    });
  }

  @Get(':id')
  get(@Param('id', ParseUUIDPipe) id: string) {
    return this.rpc.send<WorkoutProgramDto>(PATTERNS.programs.get, { id });
  }

  @Patch(':id')
  update(@Param('id', ParseUUIDPipe) id: string, @Body() dto: UpdateProgramDto) {
    const data = dto.days ? { ...dto, days: toProgramDays(dto.days) } : dto;
    return this.rpc.send<WorkoutProgramDto>(PATTERNS.programs.update, { id, data });
  }

  @Delete(':id')
  remove(@Param('id', ParseUUIDPipe) id: string) {
    return this.rpc.send<{ ok: true }>(PATTERNS.programs.remove, { id });
  }
}

/** Optional exercise fields are stored as null, as the contract's ProgramExercise expects. */
function toProgramDays(days: ProgramDayInputDto[]): ProgramDay[] {
  return days.map((day) => ({
    label: day.label,
    exercises: day.exercises.map((e) => ({
      exerciseId: e.exerciseId ?? null,
      name: e.name,
      sets: e.sets,
      reps: e.reps,
      restSeconds: e.restSeconds ?? null,
      weightKg: e.weightKg ?? null,
      notes: e.notes ?? null,
    })),
  }));
}
