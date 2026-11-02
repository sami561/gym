import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { FindOptionsWhere, Repository } from 'typeorm';
import {
  CreateProgramRequest,
  IdRequest,
  ListProgramsRequest,
  OkResult,
  UpdateProgramRequest,
  WorkoutProgramDto,
} from '@app/common';
import { WorkoutProgram } from './workout-program.entity';
import { normalizeDays } from './program-days';
import { toProgramDto } from '../mappers';
import { PeopleService } from '../shared/people.service';
import { assertDateOnly, optionalText, requireInt, requireText } from '../shared/validation';

@Injectable()
export class ProgramsService {
  constructor(
    @InjectRepository(WorkoutProgram) private readonly programs: Repository<WorkoutProgram>,
    private readonly people: PeopleService,
  ) {}

  async list(request: ListProgramsRequest): Promise<WorkoutProgramDto[]> {
    const where: FindOptionsWhere<WorkoutProgram> = {};
    if (request.memberId) where.memberId = request.memberId;
    if (request.coachId) where.coachId = request.coachId;
    if (request.activeOnly) where.isActive = true;
    const rows = await this.programs.find({ where, order: { createdAt: 'DESC' } });
    return rows.map(toProgramDto);
  }

  async get({ id }: IdRequest): Promise<WorkoutProgramDto> {
    return toProgramDto(await this.findOrFail(id));
  }

  async create(request: CreateProgramRequest): Promise<WorkoutProgramDto> {
    // Validate the payload before calling other services for names.
    const memberId = requireText(request.memberId, 'Le membre est obligatoire.');
    const fields = {
      title: requireText(request.title, 'Le titre du programme est obligatoire.'),
      goal: optionalText(request.goal),
      startDate: assertDateOnly(request.startDate, 'La date de début'),
      weeks: requireInt(request.weeks, 'La durée (semaines)', 1, 52),
      days: normalizeDays(request.days),
    };
    const coachId = request.coachId || null;
    const program = this.programs.create({
      ...fields,
      memberId,
      memberName: await this.people.memberName(memberId),
      coachId,
      coachName: coachId ? await this.people.coachName(coachId) : null,
      isActive: true,
    });
    return toProgramDto(await this.programs.save(program));
  }

  async update({ id, data }: UpdateProgramRequest): Promise<WorkoutProgramDto> {
    const program = await this.findOrFail(id);
    if (data.coachId !== undefined && (data.coachId || null) !== program.coachId) {
      program.coachId = data.coachId || null;
      program.coachName = program.coachId ? await this.people.coachName(program.coachId) : null;
    }
    if (data.title !== undefined) program.title = requireText(data.title, 'Le titre du programme est obligatoire.');
    if (data.goal !== undefined) program.goal = optionalText(data.goal);
    if (data.startDate !== undefined) program.startDate = assertDateOnly(data.startDate, 'La date de début');
    if (data.weeks !== undefined) program.weeks = requireInt(data.weeks, 'La durée (semaines)', 1, 52);
    if (data.days !== undefined) program.days = normalizeDays(data.days);
    if (data.isActive !== undefined) program.isActive = Boolean(data.isActive);
    return toProgramDto(await this.programs.save(program));
  }

  async remove({ id }: IdRequest): Promise<OkResult> {
    const result = await this.programs.delete({ id });
    if (!result.affected) throw new NotFoundException('Programme introuvable.');
    return { ok: true };
  }

  private async findOrFail(id: string): Promise<WorkoutProgram> {
    const program = await this.programs.findOne({ where: { id } });
    if (!program) throw new NotFoundException('Programme introuvable.');
    return program;
  }
}
