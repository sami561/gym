import { BadRequestException, ConflictException, Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { IsNull, QueryFailedError, Repository } from 'typeorm';
import { AttendanceDto, ClockRequest, EmployeeStatus, ListAttendanceRequest } from '@app/common';
import { EmployeesService } from '../employees/employees.service';
import { toAttendanceDto } from '../mappers';
import { dateTime } from '../shared/inputs';
import { ShiftsService } from '../shifts/shifts.service';
import { Attendance, AttendanceSource } from './attendance.entity';
import { lateMinutes, workedMinutes } from './attendance-rules';

const DAY_MS = 86_400_000;
/** Tolerance for clocks slightly ahead of the server. */
const FUTURE_TOLERANCE_MS = 5 * 60_000;
const SOURCES: AttendanceSource[] = ['MANUAL', 'DEVICE', 'KIOSK'];

@Injectable()
export class AttendanceService {
  constructor(
    @InjectRepository(Attendance) private readonly attendance: Repository<Attendance>,
    private readonly employees: EmployeesService,
    private readonly shifts: ShiftsService,
  ) {}

  async clockIn(request: ClockRequest): Promise<AttendanceDto> {
    const employee = await this.employees.findOrFail(request.employeeId);
    if (employee.status !== EmployeeStatus.ACTIVE) throw new ConflictException('Employé inactif.');
    const open = await this.attendance.findOne({ where: { employeeId: employee.id, clockOut: IsNull() } });
    if (open) throw new ConflictException('Déjà pointé.');

    const at = clockTime(request.at);
    const entry = this.attendance.create({
      employeeId: employee.id,
      clockIn: at,
      clockOut: null,
      minutes: null,
      lateMinutes: lateMinutes(at, await this.shifts.startsOnDay(employee.id, at)),
      source: clockSource(request.source),
    });
    try {
      const saved = await this.attendance.save(entry);
      return toAttendanceDto({ ...saved, employee });
    } catch (err) {
      // Two simultaneous clock-ins: the partial unique index keeps only one open entry.
      if (err instanceof QueryFailedError && (err as QueryFailedError & { code?: string }).code === '23505') {
        throw new ConflictException('Déjà pointé.');
      }
      throw err;
    }
  }

  async clockOut(request: ClockRequest): Promise<AttendanceDto> {
    const employee = await this.employees.findOrFail(request.employeeId);
    const open = await this.attendance.findOne({ where: { employeeId: employee.id, clockOut: IsNull() } });
    if (!open) throw new ConflictException('Aucun pointage en cours.');
    const at = clockTime(request.at);
    if (at < open.clockIn) throw new BadRequestException("L'heure de sortie précède l'heure d'entrée.");
    open.clockOut = at;
    open.minutes = workedMinutes(open.clockIn, at);
    const saved = await this.attendance.save(open);
    return toAttendanceDto({ ...saved, employee });
  }

  /** Defaults to the last 30 days, newest first. */
  async list(request: ListAttendanceRequest): Promise<AttendanceDto[]> {
    const to = request.to ? dateTime(request.to, 'Fin') : new Date(Date.now() + DAY_MS);
    const from = request.from ? dateTime(request.from, 'Début') : new Date(to.getTime() - 31 * DAY_MS);
    const qb = this.attendance
      .createQueryBuilder('a')
      .leftJoinAndSelect('a.employee', 'employee')
      .where('"a"."clockIn" >= :from AND "a"."clockIn" < :to', { from, to })
      .orderBy('a.clockIn', 'DESC')
      .take(1000);
    if (request.employeeId) qb.andWhere('"a"."employeeId" = :employeeId', { employeeId: request.employeeId });
    return (await qb.getMany()).map(toAttendanceDto);
  }
}

function clockTime(value: string | undefined): Date {
  if (value === undefined || value === null || value === '') return new Date();
  const at = dateTime(value, 'Heure de pointage');
  if (at.getTime() > Date.now() + FUTURE_TOLERANCE_MS) {
    throw new BadRequestException('Impossible de pointer dans le futur.');
  }
  return at;
}

function clockSource(value: unknown): AttendanceSource {
  if (value === undefined || value === null) return 'MANUAL';
  if (!SOURCES.includes(value as AttendanceSource)) throw new BadRequestException('Source de pointage invalide.');
  return value as AttendanceSource;
}
