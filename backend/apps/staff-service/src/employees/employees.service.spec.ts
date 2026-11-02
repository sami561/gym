import { BadRequestException, ConflictException, Logger, NotFoundException } from '@nestjs/common';
import { FindOperator, Repository } from 'typeorm';
import { ContractType, CreateEmployeeRequest, EmployeePosition, EmployeeStatus, SalaryType } from '@app/common';
import { Attendance } from '../attendance/attendance.entity';
import { Payroll } from '../payroll/payroll.entity';
import { Employee } from './employee.entity';
import { EmployeesService } from './employees.service';

const request: CreateEmployeeRequest = {
  firstName: ' Karim ',
  lastName: 'Jaziri',
  email: ' Karim.Jaziri@Example.com ',
  position: EmployeePosition.COACH,
  contractType: ContractType.CDD,
  hireDate: '2026-09-01',
  endDate: '2027-08-31',
  salaryType: SalaryType.PER_SESSION,
  baseSalary: 25,
  commissionRate: 0.1,
};

function setup({ stored = null as Employee | null, history = { attendance: 0, payrolls: 0 } } = {}) {
  const employees = {
    findOne: jest.fn().mockResolvedValue(stored),
    create: jest.fn((data: Partial<Employee>) => Object.assign(new Employee(), data)),
    save: jest.fn(async (row: Employee) => Object.assign(row, { id: row.id ?? 'e-new', createdAt: row.createdAt ?? new Date() })),
    delete: jest.fn().mockResolvedValue({ affected: 1 }),
    update: jest.fn().mockResolvedValue({ affected: 2 }),
  };
  const attendance = { count: jest.fn().mockResolvedValue(history.attendance) };
  const payrolls = { count: jest.fn().mockResolvedValue(history.payrolls) };
  const service = new EmployeesService(
    employees as unknown as Repository<Employee>,
    attendance as unknown as Repository<Attendance>,
    payrolls as unknown as Repository<Payroll>,
  );
  return { service, employees };
}

const karim = () =>
  Object.assign(new Employee(), {
    id: 'e-1',
    userId: null,
    firstName: 'Karim',
    lastName: 'Jaziri',
    hireDate: '2026-09-01',
    endDate: null,
    status: EmployeeStatus.ACTIVE,
    createdAt: new Date('2026-09-01T08:00:00.000Z'),
  });

describe('EmployeesService', () => {
  beforeEach(() => jest.useFakeTimers({ now: new Date(2026, 10, 2, 10, 0) }));
  afterEach(() => jest.useRealTimers());

  describe('create', () => {
    it('normalises the record and starts it active', async () => {
      expect(await setup().service.create(request)).toMatchObject({
        firstName: 'Karim',
        email: 'karim.jaziri@example.com',
        endDate: '2027-08-31',
        commissionRate: 0.1,
        status: EmployeeStatus.ACTIVE,
        userId: null,
      });
    });

    it('keeps the commission rate between 0 and 1, to 4 decimals', async () => {
      expect((await setup().service.create({ ...request, commissionRate: 0.123456 })).commissionRate).toBe(0.1235);
      for (const commissionRate of [-0.1, 1.5, Number.NaN]) {
        await expect(setup().service.create({ ...request, commissionRate })).rejects.toThrow(
          new BadRequestException('Le taux de commission doit être compris entre 0 et 1.'),
        );
      }
    });

    it('refuses a contract ending before it starts and missing names', async () => {
      await expect(setup().service.create({ ...request, endDate: '2026-08-31' })).rejects.toThrow(
        "La date de fin précède la date d'embauche.",
      );
      await expect(setup().service.create({ ...request, firstName: '  ' })).rejects.toThrow('Le prénom est obligatoire.');
      await expect(setup().service.create({ ...request, baseSalary: -1 })).rejects.toThrow(
        'Le salaire de base doit être un nombre positif ou nul.',
      );
    });

    it('links an account to one employee only', async () => {
      const { service } = setup({ stored: karim() });
      await expect(service.create({ ...request, userId: 'u-coach' })).rejects.toThrow(
        new ConflictException('Ce compte est déjà lié à un autre employé.'),
      );
    });
  });

  describe('remove', () => {
    it('deactivates an employee with history, ending the contract today', async () => {
      const { service, employees } = setup({ stored: karim(), history: { attendance: 3, payrolls: 0 } });
      await service.remove({ id: 'e-1' });
      expect(employees.delete).not.toHaveBeenCalled();
      expect(employees.save).toHaveBeenCalledWith(expect.objectContaining({ status: EmployeeStatus.INACTIVE, endDate: '2026-11-02' }));
    });

    it('keeps an end date already in the past', async () => {
      const { service, employees } = setup({ stored: Object.assign(karim(), { endDate: '2026-10-15' }), history: { attendance: 0, payrolls: 1 } });
      await service.remove({ id: 'e-1' });
      expect(employees.save).toHaveBeenCalledWith(expect.objectContaining({ endDate: '2026-10-15' }));
    });

    it('deletes an employee without history', async () => {
      const { service, employees } = setup({ stored: karim() });
      await service.remove({ id: 'e-1' });
      expect(employees.delete).toHaveBeenCalledWith('e-1');
    });

    it('answers 404 for an unknown employee', async () => {
      await expect(setup().service.remove({ id: 'e-x' })).rejects.toThrow(new NotFoundException('Employé introuvable.'));
    });
  });

  it('deactivates the contracts that ended before today', async () => {
    jest.spyOn(Logger.prototype, 'log').mockImplementation(() => undefined);
    const { service, employees } = setup();
    await service.deactivateEndedContracts();
    const [where, changes] = employees.update.mock.calls[0];
    expect(where.status).toBe(EmployeeStatus.ACTIVE);
    expect(where.endDate).toBeInstanceOf(FindOperator);
    expect([where.endDate.type, where.endDate.value]).toEqual(['lessThan', '2026-11-02']);
    expect(changes).toEqual({ status: EmployeeStatus.INACTIVE });
    jest.restoreAllMocks();
  });
});
