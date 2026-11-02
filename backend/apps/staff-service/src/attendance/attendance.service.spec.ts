import { BadRequestException, ConflictException } from '@nestjs/common';
import { QueryFailedError, Repository } from 'typeorm';
import { EmployeeStatus } from '@app/common';
import { Employee } from '../employees/employee.entity';
import { EmployeesService } from '../employees/employees.service';
import { ShiftsService } from '../shifts/shifts.service';
import { Attendance } from './attendance.entity';
import { AttendanceService } from './attendance.service';

const NOW = new Date('2026-11-02T07:12:00.000Z'); // 08:12 in Tunis
const karim = Object.assign(new Employee(), { id: 'e-1', firstName: 'Karim', lastName: 'Jaziri', status: EmployeeStatus.ACTIVE });

function setup({ open = null as Attendance | null, shiftStarts = [] as Date[] } = {}) {
  const qb: Record<string, jest.Mock> = {};
  for (const method of ['leftJoinAndSelect', 'where', 'andWhere', 'orderBy', 'take']) qb[method] = jest.fn(() => qb);
  qb.getMany = jest.fn().mockResolvedValue([]);
  const attendance = {
    findOne: jest.fn().mockResolvedValue(open),
    create: jest.fn((data: Partial<Attendance>) => Object.assign(new Attendance(), data)),
    save: jest.fn(async (row: Attendance) => Object.assign(row, { id: row.id ?? 'a-new' })),
    createQueryBuilder: jest.fn(() => qb),
  };
  const employees = { findOrFail: jest.fn().mockResolvedValue(karim) };
  const shifts = { startsOnDay: jest.fn().mockResolvedValue(shiftStarts) };
  const service = new AttendanceService(
    attendance as unknown as Repository<Attendance>,
    employees as unknown as EmployeesService,
    shifts as unknown as ShiftsService,
  );
  return { service, attendance, employees, shifts, qb };
}

describe('AttendanceService (time clock)', () => {
  beforeEach(() => jest.useFakeTimers({ now: NOW }));
  afterEach(() => jest.useRealTimers());

  describe('clockIn', () => {
    it('records the lateness against the planned shift of the day', async () => {
      const { service, shifts } = setup({ shiftStarts: [new Date('2026-11-02T07:00:00.000Z')] });
      expect(await service.clockIn({ employeeId: 'e-1' })).toMatchObject({
        employeeName: 'Karim Jaziri',
        clockIn: NOW.toISOString(),
        clockOut: null,
        lateMinutes: 12,
        source: 'MANUAL',
      });
      expect(shifts.startsOnDay).toHaveBeenCalledWith('e-1', NOW);
    });

    it('leaves lateness empty without a planned shift and keeps the source', async () => {
      expect(await setup().service.clockIn({ employeeId: 'e-1', source: 'KIOSK' })).toMatchObject({ lateMinutes: null, source: 'KIOSK' });
    });

    it('accepts a correction in the past or up to 5 minutes ahead, not later', async () => {
      expect((await setup().service.clockIn({ employeeId: 'e-1', at: '2026-11-02T07:16:59.000Z' })).clockIn).toBe('2026-11-02T07:16:59.000Z');
      await expect(setup().service.clockIn({ employeeId: 'e-1', at: '2026-11-02T07:17:01.000Z' })).rejects.toThrow(
        new BadRequestException('Impossible de pointer dans le futur.'),
      );
      await expect(setup().service.clockIn({ employeeId: 'e-1', at: 'ce matin' })).rejects.toThrow(
        'Heure de pointage : date/heure invalide.',
      );
    });

    it('refuses inactive employees, a second open entry and unknown sources', async () => {
      const inactive = setup();
      inactive.employees.findOrFail.mockResolvedValue(Object.assign(new Employee(), karim, { status: EmployeeStatus.INACTIVE }));
      await expect(inactive.service.clockIn({ employeeId: 'e-1' })).rejects.toThrow(new ConflictException('Employé inactif.'));
      await expect(setup({ open: new Attendance() }).service.clockIn({ employeeId: 'e-1' })).rejects.toThrow('Déjà pointé.');
      await expect(setup().service.clockIn({ employeeId: 'e-1', source: 'BADGE' as 'KIOSK' })).rejects.toThrow(
        'Source de pointage invalide.',
      );
    });

    it('turns a simultaneous clock-in (unique index) into "Déjà pointé."', async () => {
      const { service, attendance } = setup();
      attendance.save.mockRejectedValue(
        new QueryFailedError('INSERT INTO "attendance" ...', [], Object.assign(new Error('duplicate key'), { code: '23505' })),
      );
      await expect(service.clockIn({ employeeId: 'e-1' })).rejects.toThrow(new ConflictException('Déjà pointé.'));
      attendance.save.mockRejectedValue(new Error('connection lost'));
      await expect(service.clockIn({ employeeId: 'e-1' })).rejects.toThrow('connection lost');
    });
  });

  describe('clockOut', () => {
    const openEntry = () =>
      Object.assign(new Attendance(), { id: 'a-1', employeeId: 'e-1', clockIn: new Date('2026-11-02T05:00:00.000Z'), clockOut: null, minutes: null, lateMinutes: 0, source: 'MANUAL' });

    it('closes the open entry with the worked minutes', async () => {
      expect(await setup({ open: openEntry() }).service.clockOut({ employeeId: 'e-1' })).toMatchObject({
        clockOut: NOW.toISOString(),
        minutes: 132,
      });
    });

    it('needs an open entry and an exit after the entry', async () => {
      await expect(setup().service.clockOut({ employeeId: 'e-1' })).rejects.toThrow(new ConflictException('Aucun pointage en cours.'));
      await expect(setup({ open: openEntry() }).service.clockOut({ employeeId: 'e-1', at: '2026-11-02T04:59:00.000Z' })).rejects.toThrow(
        "L'heure de sortie précède l'heure d'entrée.",
      );
    });
  });

  it('lists the last 31 days up to tomorrow by default', async () => {
    const { service, qb } = setup();
    await service.list({});
    expect(qb.where).toHaveBeenCalledWith('"a"."clockIn" >= :from AND "a"."clockIn" < :to', {
      from: new Date(NOW.getTime() - 30 * 86_400_000),
      to: new Date(NOW.getTime() + 86_400_000),
    });
  });
});
