import { BadRequestException, ConflictException, NotFoundException } from '@nestjs/common';
import { Repository } from 'typeorm';
import { EmployeeStatus, LeaveStatus, LeaveType, Role } from '@app/common';
import { Employee } from '../employees/employee.entity';
import { EmployeesService } from '../employees/employees.service';
import { Leave } from './leave.entity';
import { LeavesService } from './leaves.service';

const karim = Object.assign(new Employee(), { id: 'e-1', firstName: 'Karim', lastName: 'Jaziri', status: EmployeeStatus.ACTIVE });
const actor = { id: 'u-admin', role: Role.ADMIN, name: 'Admin' };

function setup(found: Leave | null = null) {
  const leaves = {
    findOne: jest.fn().mockResolvedValue(found),
    create: jest.fn((data: Partial<Leave>) => Object.assign(new Leave(), data)),
    save: jest.fn(async (row: Leave) => Object.assign(row, { id: row.id ?? 'l-new', createdAt: row.createdAt ?? new Date() })),
    delete: jest.fn().mockResolvedValue({ affected: 1 }),
  };
  const employees = { findOrFail: jest.fn().mockResolvedValue(karim) };
  return { service: new LeavesService(leaves as unknown as Repository<Leave>, employees as unknown as EmployeesService), leaves };
}

describe('LeavesService', () => {
  describe('create', () => {
    it('counts both ends and starts as pending', async () => {
      const { service } = setup();
      expect(await service.create({ employeeId: 'e-1', type: LeaveType.ANNUAL, from: '2026-12-28', to: '2027-01-02', reason: ' Famille ' })).toMatchObject({
        from: '2026-12-28',
        to: '2027-01-02',
        days: 6,
        status: LeaveStatus.PENDING,
        reason: 'Famille',
        employeeName: 'Karim Jaziri',
      });
      expect((await setup().service.create({ employeeId: 'e-1', type: LeaveType.SICK, from: '2026-11-02', to: '2026-11-02' })).days).toBe(1);
    });

    it('validates the dates and the type in French', async () => {
      const { service } = setup();
      await expect(service.create({ employeeId: 'e-1', type: LeaveType.ANNUAL, from: '2026-02-30', to: '2026-03-02' })).rejects.toThrow(
        new BadRequestException('Début du congé : date invalide (AAAA-MM-JJ attendu).'),
      );
      await expect(service.create({ employeeId: 'e-1', type: LeaveType.ANNUAL, from: '2026-11-10', to: '2026-11-09' })).rejects.toThrow(
        'La fin du congé précède son début.',
      );
      await expect(
        service.create({ employeeId: 'e-1', type: 'VACANCES' as LeaveType, from: '2026-11-10', to: '2026-11-12' }),
      ).rejects.toThrow('Type de congé invalide.');
    });

    it('refuses a leave overlapping a pending or approved one', async () => {
      const { service } = setup(Object.assign(new Leave(), { id: 'l-1', status: LeaveStatus.APPROVED }));
      await expect(service.create({ employeeId: 'e-1', type: LeaveType.ANNUAL, from: '2026-11-10', to: '2026-11-12' })).rejects.toThrow(
        new ConflictException('Un congé existe déjà sur cette période.'),
      );
    });
  });

  describe('decide', () => {
    const pending = () =>
      Object.assign(new Leave(), {
        id: 'l-1',
        employeeId: 'e-1',
        employee: karim,
        type: LeaveType.UNPAID,
        startDate: '2026-11-10',
        endDate: '2026-11-12',
        days: 3,
        status: LeaveStatus.PENDING,
        reason: null,
        decidedByName: null,
        decidedAt: null,
        createdAt: new Date('2026-11-01T08:00:00.000Z'),
      });

    it('approves a pending leave and records who decided', async () => {
      const { service } = setup(pending());
      expect(await service.decide({ id: 'l-1', status: LeaveStatus.APPROVED, actor })).toMatchObject({
        status: LeaveStatus.APPROVED,
        decidedByName: 'Admin',
      });
    });

    it('refuses other decisions, unknown leaves and second decisions', async () => {
      await expect(setup(pending()).service.decide({ id: 'l-1', status: LeaveStatus.PENDING as LeaveStatus.APPROVED, actor })).rejects.toThrow(
        'Décision invalide : APPROVED ou REJECTED.',
      );
      await expect(setup(null).service.decide({ id: 'l-x', status: LeaveStatus.REJECTED, actor })).rejects.toThrow(
        new NotFoundException('Congé introuvable.'),
      );
      await expect(
        setup(Object.assign(pending(), { status: LeaveStatus.REJECTED })).service.decide({ id: 'l-1', status: LeaveStatus.APPROVED, actor }),
      ).rejects.toThrow(new ConflictException('Ce congé a déjà été traité.'));
    });
  });

  it('answers 404 when deleting an unknown leave', async () => {
    const { service, leaves } = setup();
    leaves.delete.mockResolvedValue({ affected: 0 });
    await expect(service.remove({ id: 'l-x' })).rejects.toThrow(new NotFoundException('Congé introuvable.'));
  });
});
