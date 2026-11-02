import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import {
  CreatePaymentRequest,
  EVENTS,
  EventBus,
  ListPaymentsRequest,
  PaymentDto,
  PaymentsPage,
} from '@app/common';
import { Payment } from './payment.entity';
import { Member } from '../members/member.entity';
import { Subscription } from '../subscriptions/subscription.entity';
import { toPaymentDto } from '../mappers';

@Injectable()
export class PaymentsService {
  constructor(
    @InjectRepository(Payment) private readonly payments: Repository<Payment>,
    @InjectRepository(Member) private readonly members: Repository<Member>,
    @InjectRepository(Subscription) private readonly subs: Repository<Subscription>,
    private readonly events: EventBus,
  ) {}

  async create(req: CreatePaymentRequest): Promise<PaymentDto> {
    if (!(req.amount > 0)) throw new BadRequestException('Le montant doit être positif.');
    const member = await this.members.findOne({ where: { id: req.memberId } });
    if (!member) throw new NotFoundException('Membre introuvable.');
    if (req.subscriptionId) {
      const sub = await this.subs.findOne({ where: { id: req.subscriptionId, memberId: req.memberId } });
      if (!sub) throw new BadRequestException('Cet abonnement n’appartient pas à ce membre.');
    }
    const paidAt = req.paidAt ? new Date(req.paidAt) : new Date();
    if (Number.isNaN(paidAt.getTime()) || paidAt.getTime() > Date.now() + 60_000) {
      throw new BadRequestException('Date de paiement invalide.');
    }
    const { id } = await this.payments.save(
      this.payments.create({
        memberId: member.id,
        subscriptionId: req.subscriptionId ?? null,
        amount: Math.round(req.amount * 1000) / 1000,
        method: req.method,
        reference: req.reference ?? null,
        paidAt,
        receivedById: req.actor?.id ?? null,
        receivedByName: req.actor?.name ?? null,
      }),
    );
    const payment = await this.payments.findOneOrFail({
      where: { id },
      relations: { member: true, subscription: true },
    });
    const dto = toPaymentDto(payment);
    this.events.publish(EVENTS.paymentReceived, {
      paymentId: dto.id,
      memberId: member.id,
      memberCode: member.memberCode,
      firstName: member.firstName,
      lastName: member.lastName,
      email: member.email,
      amount: dto.amount,
      method: dto.method,
      reference: dto.reference,
      planName: dto.planName,
      paidAt: dto.paidAt,
    });
    return dto;
  }

  async list(req: ListPaymentsRequest): Promise<PaymentsPage> {
    const page = Math.max(1, req.page ?? 1);
    const pageSize = Math.min(200, Math.max(1, req.pageSize ?? 50));
    const qb = this.payments
      .createQueryBuilder('p')
      .leftJoinAndSelect('p.member', 'member')
      .leftJoinAndSelect('p.subscription', 'subscription')
      .leftJoinAndSelect('subscription.plan', 'plan');
    if (req.from) qb.andWhere('p.paidAt >= :from', { from: new Date(req.from) });
    if (req.to) qb.andWhere('p.paidAt <= :to', { to: endOfDayIfDate(req.to) });
    if (req.method) qb.andWhere('p.method = :method', { method: req.method });
    if (req.memberId) qb.andWhere('p.memberId = :memberId', { memberId: req.memberId });

    const sumRow = await qb.clone().select('COALESCE(SUM(p.amount), 0)', 'sum').getRawOne<{ sum: string }>();
    const [rows, total] = await qb
      .orderBy('p.paidAt', 'DESC')
      .skip((page - 1) * pageSize)
      .take(pageSize)
      .getManyAndCount();
    return { items: rows.map(toPaymentDto), total, page, pageSize, sum: Number(sumRow?.sum ?? 0) };
  }
}

/** "2026-11-02" means the whole day; full ISO strings are used as-is. */
function endOfDayIfDate(value: string): Date {
  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    const [y, m, d] = value.split('-').map(Number);
    return new Date(y, m - 1, d, 23, 59, 59, 999);
  }
  return new Date(value);
}
