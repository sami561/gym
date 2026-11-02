import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import {
  CreateShiftRequest,
  IdRequest,
  ListShiftsRequest,
  OkResult,
  ShiftDto,
  UpdateShiftRequest,
  startOfDay,
} from '@app/common';
import { EmployeesService } from '../employees/employees.service';
import { toShiftDto } from '../mappers';
import { dateTime, optionalText } from '../shared/inputs';
import { Shift } from './shift.entity';

const DAY_MS = 86_400_000;
const MAX_SHIFT_MS = DAY_MS;

@Injectable()
export class ShiftsService {
  constructor(
    @InjectRepository(Shift) private readonly shifts: Repository<Shift>,
    private readonly employees: EmployeesService,
  ) {}

  /** Defaults to the 7 days starting today. */
  async list(request: ListShiftsRequest): Promise<ShiftDto[]> {
    const from = request.from ? dateTime(request.from, 'Début') : startOfDay();
    const to = request.to ? dateTime(request.to, 'Fin') : new Date(from.getTime() + 7 * DAY_MS);
    const qb = this.shifts
      .createQueryBuilder('s')
      .leftJoinAndSelect('s.employee', 'employee')
      .where('"s"."startsAt" >= :from AND "s"."startsAt" < :to', { from, to })
      .orderBy('s.startsAt', 'ASC');
    if (request.employeeId) qb.andWhere('"s"."employeeId" = :employeeId', { employeeId: request.employeeId });
    return (await qb.getMany()).map(toShiftDto);
  }

  async create(request: CreateShiftRequest): Promise<ShiftDto[]> {
    const employee = await this.employees.findOrFail(request.employeeId);
    const startsAt = dateTime(request.startsAt, 'Début du créneau');
    const endsAt = dateTime(request.endsAt, 'Fin du créneau');
    assertSlot(startsAt, endsAt);
    const repeatWeeks = request.repeatWeeks ?? 0;
    if (!Number.isInteger(repeatWeeks) || repeatWeeks < 0 || repeatWeeks > 12) {
      throw new BadRequestException('La répétition doit être comprise entre 0 et 12 semaines.');
    }

    const occurrences: Shift[] = [];
    for (let week = 0; week <= repeatWeeks; week++) {
      const start = shiftByDays(startsAt, week * 7);
      const end = shiftByDays(endsAt, week * 7);
      await this.assertNoOverlap(employee.id, start, end);
      occurrences.push(
        this.shifts.create({
          employeeId: employee.id,
          startsAt: start,
          endsAt: end,
          task: optionalText(request.task) ?? null,
          roomName: optionalText(request.roomName) ?? null,
        }),
      );
    }
    const saved = await this.shifts.save(occurrences);
    return saved.map((shift) => toShiftDto({ ...shift, employee }));
  }

  async update(request: UpdateShiftRequest): Promise<ShiftDto> {
    const shift = await this.shifts.findOne({ where: { id: request.id }, relations: { employee: true } });
    if (!shift) throw new NotFoundException('Créneau introuvable.');
    const data = request.data ?? {};
    if (data.employeeId !== undefined && data.employeeId !== shift.employeeId) {
      shift.employee = await this.employees.findOrFail(data.employeeId);
      shift.employeeId = shift.employee.id;
    }
    if (data.startsAt !== undefined) shift.startsAt = dateTime(data.startsAt, 'Début du créneau');
    if (data.endsAt !== undefined) shift.endsAt = dateTime(data.endsAt, 'Fin du créneau');
    if (data.task !== undefined) shift.task = optionalText(data.task) ?? null;
    if (data.roomName !== undefined) shift.roomName = optionalText(data.roomName) ?? null;
    assertSlot(shift.startsAt, shift.endsAt);
    await this.assertNoOverlap(shift.employeeId, shift.startsAt, shift.endsAt, shift.id);
    return toShiftDto(await this.shifts.save(shift));
  }

  async remove(request: IdRequest): Promise<OkResult> {
    const result = await this.shifts.delete({ id: request.id });
    if (!result.affected) throw new NotFoundException('Créneau introuvable.');
    return { ok: true };
  }

  /** Planned shift starts of an employee on the calendar day of `day`. */
  async startsOnDay(employeeId: string, day: Date): Promise<Date[]> {
    const from = startOfDay(day);
    const to = new Date(from.getTime() + DAY_MS);
    const shifts = await this.shifts
      .createQueryBuilder('s')
      .where('"s"."employeeId" = :employeeId', { employeeId })
      .andWhere('"s"."startsAt" >= :from AND "s"."startsAt" < :to', { from, to })
      .getMany();
    return shifts.map((shift) => shift.startsAt);
  }

  private async assertNoOverlap(employeeId: string, startsAt: Date, endsAt: Date, exceptId?: string): Promise<void> {
    const qb = this.shifts
      .createQueryBuilder('s')
      .where('"s"."employeeId" = :employeeId', { employeeId })
      .andWhere('"s"."startsAt" < :endsAt AND "s"."endsAt" > :startsAt', { startsAt, endsAt });
    if (exceptId) qb.andWhere('"s"."id" <> :exceptId', { exceptId });
    const clash = await qb.getOne();
    if (clash) {
      const when = clash.startsAt.toLocaleString('fr-FR', { dateStyle: 'short', timeStyle: 'short' });
      throw new ConflictException(`Chevauchement avec un créneau existant (${when}).`);
    }
  }
}

function assertSlot(startsAt: Date, endsAt: Date): void {
  if (endsAt <= startsAt) throw new BadRequestException('La fin du créneau doit être après le début.');
  if (endsAt.getTime() - startsAt.getTime() > MAX_SHIFT_MS) {
    throw new BadRequestException('Un créneau ne peut pas dépasser 24 heures.');
  }
}

/** Same wall-clock time `days` later (calendar arithmetic, safe across DST changes). */
function shiftByDays(date: Date, days: number): Date {
  const copy = new Date(date);
  copy.setDate(copy.getDate() + days);
  return copy;
}
