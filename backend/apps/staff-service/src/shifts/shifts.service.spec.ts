import { BadRequestException, ConflictException, NotFoundException } from '@nestjs/common';
import { Repository } from 'typeorm';
import { EmployeePosition, EmployeeStatus } from '@app/common';
import { Employee } from '../employees/employee.entity';
import { EmployeesService } from '../employees/employees.service';
import { Shift } from './shift.entity';
import { ShiftsService } from './shifts.service';

const karim = Object.assign(new Employee(), {
  id: 'e-1',
  firstName: 'Karim',
  lastName: 'Jaziri',
  position: EmployeePosition.COACH,
  status: EmployeeStatus.ACTIVE,
});

/** Each createQueryBuilder() call gets its own chain; getOne answers come from `clashes` in order. */
function setup(clashes: (Shift | null)[] = [], listed: Shift[] = []) {
  const builders: Record<string, jest.Mock>[] = [];
  const shifts = {
    createQueryBuilder: jest.fn(() => {
      const qb: Record<string, jest.Mock> = {};
      for (const method of ['leftJoinAndSelect', 'where', 'andWhere', 'orderBy']) qb[method] = jest.fn(() => qb);
      qb.getOne = jest.fn(async () => clashes.shift() ?? null);
      qb.getMany = jest.fn(async () => listed);
      builders.push(qb);
      return qb;
    }),
    create: jest.fn((data: Partial<Shift>) => Object.assign(new Shift(), data)),
    save: jest.fn(async (rows: Shift | Shift[]) => rows),
    findOne: jest.fn(),
    delete: jest.fn().mockResolvedValue({ affected: 1 }),
  };
  const employees = { findOrFail: jest.fn().mockResolvedValue(karim) };
  const service = new ShiftsService(shifts as unknown as Repository<Shift>, employees as unknown as EmployeesService);
  return { service, shifts, employees, builders };
}

describe('ShiftsService (staff roster, Africa/Tunis)', () => {
  beforeEach(() => jest.useFakeTimers({ now: new Date(2026, 10, 2, 9, 0) }));
  afterEach(() => jest.useRealTimers());

  describe('create', () => {
    // 06:00–14:00 in Tunis = 05:00–13:00 UTC
    const morning = { employeeId: 'e-1', startsAt: '2026-11-02T06:00:00+01:00', endsAt: '2026-11-02T14:00:00+01:00' };

    it('repeats the shift weekly at the same local time', async () => {
      const { service, shifts } = setup();
      const created = await service.create({ ...morning, repeatWeeks: 2, task: ' Accueil ', roomName: '' });
      expect(created.map((s) => [s.startsAt, s.endsAt])).toEqual([
        ['2026-11-02T05:00:00.000Z', '2026-11-02T13:00:00.000Z'],
        ['2026-11-09T05:00:00.000Z', '2026-11-09T13:00:00.000Z'],
        ['2026-11-16T05:00:00.000Z', '2026-11-16T13:00:00.000Z'],
      ]);
      expect(created[0]).toMatchObject({ employeeName: 'Karim Jaziri', task: 'Accueil', roomName: null });
      expect(shifts.save).toHaveBeenCalledTimes(1);
    });

    it('accepts 0 to 12 repeat weeks', async () => {
      for (const repeatWeeks of [-1, 13, 1.5]) {
        await expect(setup().service.create({ ...morning, repeatWeeks })).rejects.toThrow(
          new BadRequestException('La répétition doit être comprise entre 0 et 12 semaines.'),
        );
      }
      expect(await setup().service.create({ ...morning, repeatWeeks: 12 })).toHaveLength(13);
    });

    it('needs an end after the start and at most 24 hours', async () => {
      await expect(setup().service.create({ ...morning, endsAt: morning.startsAt })).rejects.toThrow(
        'La fin du créneau doit être après le début.',
      );
      await expect(setup().service.create({ ...morning, endsAt: '2026-11-03T06:01:00+01:00' })).rejects.toThrow(
        'Un créneau ne peut pas dépasser 24 heures.',
      );
      await expect(setup().service.create({ ...morning, endsAt: '2026-11-03T06:00:00+01:00' })).resolves.toHaveLength(1);
      await expect(setup().service.create({ ...morning, startsAt: 'lundi' })).rejects.toThrow('Début du créneau : date/heure invalide.');
    });

    it('refuses an overlap on any week, naming the existing shift in local time, and saves nothing', async () => {
      const existing = Object.assign(new Shift(), { id: 'sh-9', startsAt: new Date('2026-11-09T07:00:00.000Z'), endsAt: new Date('2026-11-09T15:00:00.000Z') });
      const { service, shifts, builders } = setup([null, existing]);
      await expect(service.create({ ...morning, repeatWeeks: 2 })).rejects.toThrow(
        new ConflictException('Chevauchement avec un créneau existant (09/11/2026 08:00).'),
      );
      expect(shifts.save).not.toHaveBeenCalled();
      expect(builders[1].andWhere).toHaveBeenCalledWith('"s"."startsAt" < :endsAt AND "s"."endsAt" > :startsAt', {
        startsAt: new Date('2026-11-09T05:00:00.000Z'),
        endsAt: new Date('2026-11-09T13:00:00.000Z'),
      });
    });
  });

  describe('update', () => {
    const stored = () =>
      Object.assign(new Shift(), {
        id: 'sh-1',
        employeeId: 'e-1',
        employee: karim,
        startsAt: new Date('2026-11-02T05:00:00.000Z'),
        endsAt: new Date('2026-11-02T13:00:00.000Z'),
        task: null,
        roomName: null,
      });

    it('checks overlaps against the other shifts only', async () => {
      const { service, shifts, builders } = setup();
      shifts.findOne.mockResolvedValue(stored());
      const dto = await service.update({ id: 'sh-1', data: { endsAt: '2026-11-02T15:00:00+01:00' } });
      expect(dto.endsAt).toBe('2026-11-02T14:00:00.000Z');
      expect(builders[0].andWhere).toHaveBeenCalledWith('"s"."id" <> :exceptId', { exceptId: 'sh-1' });
    });

    it('validates the new slot', async () => {
      const { service, shifts } = setup();
      shifts.findOne.mockResolvedValue(stored());
      await expect(service.update({ id: 'sh-1', data: { startsAt: '2026-11-02T15:00:00+01:00' } })).rejects.toThrow(
        'La fin du créneau doit être après le début.',
      );
    });

    it('answers 404 for an unknown shift', async () => {
      const { service, shifts } = setup();
      shifts.findOne.mockResolvedValue(null);
      await expect(service.update({ id: 'sh-x', data: {} })).rejects.toThrow(new NotFoundException('Créneau introuvable.'));
      shifts.delete.mockResolvedValue({ affected: 0 });
      await expect(service.remove({ id: 'sh-x' })).rejects.toThrow('Créneau introuvable.');
    });
  });

  describe('list and day lookups', () => {
    it('defaults to the 7 days starting at local midnight today', async () => {
      const { service, builders } = setup();
      await service.list({});
      expect(builders[0].where).toHaveBeenCalledWith('"s"."startsAt" >= :from AND "s"."startsAt" < :to', {
        from: new Date(2026, 10, 2),
        to: new Date(2026, 10, 9),
      });
    });

    it('returns the shift starts of an employee on a local calendar day', async () => {
      const starts = [new Date('2026-11-02T05:00:00.000Z'), new Date('2026-11-02T16:00:00.000Z')];
      const { service, builders } = setup([], starts.map((startsAt) => Object.assign(new Shift(), { startsAt })));
      expect(await service.startsOnDay('e-1', new Date('2026-11-02T23:30:00.000Z'))).toEqual(starts);
      // 23:30 UTC on 2 Nov is 3 Nov in Tunis: the lookup covers 3 Nov, 00:00 to 24:00 local.
      expect(builders[0].andWhere).toHaveBeenCalledWith('"s"."startsAt" >= :from AND "s"."startsAt" < :to', {
        from: new Date(2026, 10, 3),
        to: new Date(2026, 10, 4),
      });
    });
  });
});
