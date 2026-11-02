import { BadRequestException, ConflictException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { InjectRepository } from '@nestjs/typeorm';
import { Brackets, LessThan, Not, Repository } from 'typeorm';
import {
  ContractType,
  CreateEmployeeRequest,
  EmployeeDto,
  EmployeePosition,
  EmployeeStatus,
  IdRequest,
  ListEmployeesRequest,
  OkResult,
  SalaryType,
  UpdateEmployeeRequest,
  toDateOnly,
} from '@app/common';
import { Attendance } from '../attendance/attendance.entity';
import { Payroll } from '../payroll/payroll.entity';
import { toEmployeeDto } from '../mappers';
import { amount, dateOnly, oneOf, optionalDateOnly, optionalText, requiredText } from '../shared/inputs';
import { Employee } from './employee.entity';

@Injectable()
export class EmployeesService {
  private readonly logger = new Logger(EmployeesService.name);

  constructor(
    @InjectRepository(Employee) private readonly employees: Repository<Employee>,
    @InjectRepository(Attendance) private readonly attendance: Repository<Attendance>,
    @InjectRepository(Payroll) private readonly payrolls: Repository<Payroll>,
  ) {}

  async list(request: ListEmployeesRequest): Promise<EmployeeDto[]> {
    const qb = this.employees.createQueryBuilder('e').orderBy('e.lastName', 'ASC').addOrderBy('e.firstName', 'ASC');
    if (request.position) qb.andWhere('"e"."position" = :position', { position: request.position });
    if (request.status) qb.andWhere('"e"."status" = :status', { status: request.status });
    const terms = (request.search ?? '').trim().split(/\s+/).filter(Boolean).slice(0, 5);
    terms.forEach((term, index) => {
      const key = `term${index}`;
      qb.andWhere(
        new Brackets((where) => {
          for (const column of ['firstName', 'lastName', 'email', 'phone', 'cin']) {
            where.orWhere(`"e"."${column}" ILIKE :${key}`);
          }
        }),
        { [key]: `%${term.replace(/[\\%_]/g, (char) => `\\${char}`)}%` },
      );
    });
    return (await qb.getMany()).map(toEmployeeDto);
  }

  async get(request: IdRequest): Promise<EmployeeDto> {
    return toEmployeeDto(await this.findOrFail(request.id));
  }

  async create(request: CreateEmployeeRequest): Promise<EmployeeDto> {
    const employee = this.employees.create({
      userId: optionalText(request.userId) ?? null,
      firstName: requiredText(request.firstName, 'Le prénom'),
      lastName: requiredText(request.lastName, 'Le nom'),
      email: optionalText(request.email)?.toLowerCase() ?? null,
      phone: optionalText(request.phone) ?? null,
      position: oneOf(request.position, EmployeePosition, 'Poste'),
      contractType: oneOf(request.contractType, ContractType, 'Type de contrat'),
      hireDate: dateOnly(request.hireDate, "Date d'embauche"),
      endDate: optionalDateOnly(request.endDate, 'Date de fin') ?? null,
      salaryType: oneOf(request.salaryType, SalaryType, 'Type de rémunération'),
      baseSalary: amount(request.baseSalary, 'Le salaire de base'),
      commissionRate: commissionRate(request.commissionRate ?? 0),
      cin: optionalText(request.cin) ?? null,
      cnssNumber: optionalText(request.cnssNumber) ?? null,
      rib: optionalText(request.rib) ?? null,
      notes: optionalText(request.notes) ?? null,
      status: EmployeeStatus.ACTIVE,
    });
    assertContractDates(employee);
    if (employee.userId) await this.assertUserFree(employee.userId);
    return toEmployeeDto(await this.employees.save(employee));
  }

  async update(request: UpdateEmployeeRequest): Promise<EmployeeDto> {
    const employee = await this.findOrFail(request.id);
    const data = request.data ?? {};
    if (data.userId !== undefined) {
      employee.userId = optionalText(data.userId) ?? null;
      if (employee.userId) await this.assertUserFree(employee.userId, employee.id);
    }
    if (data.firstName !== undefined) employee.firstName = requiredText(data.firstName, 'Le prénom');
    if (data.lastName !== undefined) employee.lastName = requiredText(data.lastName, 'Le nom');
    if (data.email !== undefined) employee.email = optionalText(data.email)?.toLowerCase() ?? null;
    if (data.phone !== undefined) employee.phone = optionalText(data.phone) ?? null;
    if (data.position !== undefined) employee.position = oneOf(data.position, EmployeePosition, 'Poste');
    if (data.contractType !== undefined) {
      employee.contractType = oneOf(data.contractType, ContractType, 'Type de contrat');
    }
    if (data.hireDate !== undefined) employee.hireDate = dateOnly(data.hireDate, "Date d'embauche");
    if (data.endDate !== undefined) employee.endDate = optionalDateOnly(data.endDate, 'Date de fin') ?? null;
    if (data.salaryType !== undefined) {
      employee.salaryType = oneOf(data.salaryType, SalaryType, 'Type de rémunération');
    }
    if (data.baseSalary !== undefined) employee.baseSalary = amount(data.baseSalary, 'Le salaire de base');
    if (data.commissionRate !== undefined) employee.commissionRate = commissionRate(data.commissionRate);
    if (data.cin !== undefined) employee.cin = optionalText(data.cin) ?? null;
    if (data.cnssNumber !== undefined) employee.cnssNumber = optionalText(data.cnssNumber) ?? null;
    if (data.rib !== undefined) employee.rib = optionalText(data.rib) ?? null;
    if (data.notes !== undefined) employee.notes = optionalText(data.notes) ?? null;
    if (data.status !== undefined) employee.status = oneOf(data.status, EmployeeStatus, 'Statut');
    assertContractDates(employee);
    return toEmployeeDto(await this.employees.save(employee));
  }

  /** Employees with time-clock or payroll history are deactivated instead of deleted. */
  async remove(request: IdRequest): Promise<OkResult> {
    const employee = await this.findOrFail(request.id);
    const [attendance, payrolls] = await Promise.all([
      this.attendance.count({ where: { employeeId: employee.id } }),
      this.payrolls.count({ where: { employeeId: employee.id } }),
    ]);
    if (attendance || payrolls) {
      const today = toDateOnly();
      employee.status = EmployeeStatus.INACTIVE;
      employee.endDate = employee.endDate && employee.endDate < today ? employee.endDate : today;
      await this.employees.save(employee);
    } else {
      await this.employees.delete(employee.id);
    }
    return { ok: true };
  }

  async findOrFail(id: string): Promise<Employee> {
    const employee = id ? await this.employees.findOne({ where: { id } }) : null;
    if (!employee) throw new NotFoundException('Employé introuvable.');
    return employee;
  }

  /** CDD / internship contracts end on their own. */
  @Cron(CronExpression.EVERY_DAY_AT_2AM)
  async deactivateEndedContracts(): Promise<void> {
    const result = await this.employees.update(
      { status: EmployeeStatus.ACTIVE, endDate: LessThan(toDateOnly()) },
      { status: EmployeeStatus.INACTIVE },
    );
    if (result.affected) this.logger.log(`${result.affected} contrat(s) arrivé(s) à échéance désactivé(s)`);
  }

  private async assertUserFree(userId: string, exceptId?: string): Promise<void> {
    const linked = await this.employees.findOne({
      where: exceptId ? { userId, id: Not(exceptId) } : { userId },
    });
    if (linked) throw new ConflictException('Ce compte est déjà lié à un autre employé.');
  }
}

function commissionRate(value: unknown): number {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < 0 || value > 1) {
    throw new BadRequestException('Le taux de commission doit être compris entre 0 et 1.');
  }
  return Math.round(value * 10_000) / 10_000;
}

function assertContractDates(employee: Employee): void {
  if (employee.endDate && employee.endDate < employee.hireDate) {
    throw new BadRequestException("La date de fin précède la date d'embauche.");
  }
}
