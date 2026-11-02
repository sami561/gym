import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { LessThanOrEqual, MoreThanOrEqual, Not, Repository } from 'typeorm';
import {
  CreateLeaveRequest,
  DecideLeaveRequest,
  IdRequest,
  LeaveDto,
  LeaveStatus,
  LeaveType,
  ListLeavesRequest,
  OkResult,
  diffDays,
} from '@app/common';
import { EmployeesService } from '../employees/employees.service';
import { toLeaveDto } from '../mappers';
import { dateOnly, oneOf, optionalText } from '../shared/inputs';
import { Leave } from './leave.entity';

@Injectable()
export class LeavesService {
  constructor(
    @InjectRepository(Leave) private readonly leaves: Repository<Leave>,
    private readonly employees: EmployeesService,
  ) {}

  async list(request: ListLeavesRequest): Promise<LeaveDto[]> {
    const leaves = await this.leaves.find({
      where: {
        ...(request.status ? { status: request.status } : {}),
        ...(request.employeeId ? { employeeId: request.employeeId } : {}),
      },
      relations: { employee: true },
      order: { startDate: 'DESC', createdAt: 'DESC' },
      take: 500,
    });
    return leaves.map(toLeaveDto);
  }

  async create(request: CreateLeaveRequest): Promise<LeaveDto> {
    const employee = await this.employees.findOrFail(request.employeeId);
    const from = dateOnly(request.from, 'Début du congé');
    const to = dateOnly(request.to, 'Fin du congé');
    if (to < from) throw new BadRequestException('La fin du congé précède son début.');

    const overlapping = await this.leaves.findOne({
      where: {
        employeeId: employee.id,
        status: Not(LeaveStatus.REJECTED),
        startDate: LessThanOrEqual(to),
        endDate: MoreThanOrEqual(from),
      },
    });
    if (overlapping) throw new ConflictException('Un congé existe déjà sur cette période.');

    const saved = await this.leaves.save(
      this.leaves.create({
        employeeId: employee.id,
        type: oneOf(request.type, LeaveType, 'Type de congé'),
        startDate: from,
        endDate: to,
        days: diffDays(from, to) + 1,
        status: LeaveStatus.PENDING,
        reason: optionalText(request.reason) ?? null,
      }),
    );
    return toLeaveDto({ ...saved, employee });
  }

  async decide(request: DecideLeaveRequest): Promise<LeaveDto> {
    if (request.status !== LeaveStatus.APPROVED && request.status !== LeaveStatus.REJECTED) {
      throw new BadRequestException('Décision invalide : APPROVED ou REJECTED.');
    }
    const leave = await this.leaves.findOne({ where: { id: request.id }, relations: { employee: true } });
    if (!leave) throw new NotFoundException('Congé introuvable.');
    if (leave.status !== LeaveStatus.PENDING) throw new ConflictException('Ce congé a déjà été traité.');
    leave.status = request.status;
    leave.decidedByName = request.actor?.name ?? null;
    leave.decidedAt = new Date();
    return toLeaveDto(await this.leaves.save(leave));
  }

  async remove(request: IdRequest): Promise<OkResult> {
    const result = await this.leaves.delete({ id: request.id });
    if (!result.affected) throw new NotFoundException('Congé introuvable.');
    return { ok: true };
  }
}
