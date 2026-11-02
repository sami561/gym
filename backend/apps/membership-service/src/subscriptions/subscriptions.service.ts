import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import {
  CreateSubscriptionRequest,
  EVENTS,
  EventBus,
  FreezeSubscriptionRequest,
  SubscriptionDto,
  SubscriptionStatus,
  UnfreezeSubscriptionRequest,
  UpdateSubscriptionRequest,
  addDays,
  diffDays,
  lastCoveredDay,
  toDateOnly,
} from '@app/common';
import { Subscription } from './subscription.entity';
import { Member } from '../members/member.entity';
import { Plan } from '../plans/plan.entity';
import { PaymentsService } from '../payments/payments.service';
import { PromosService } from '../promos/promos.service';
import { toSubscriptionDto } from '../mappers';
import { accessWindows } from './membership-state';

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const round3 = (n: number) => Math.round(n * 1000) / 1000;

@Injectable()
export class SubscriptionsService {
  constructor(
    @InjectRepository(Subscription) private readonly subs: Repository<Subscription>,
    @InjectRepository(Member) private readonly members: Repository<Member>,
    @InjectRepository(Plan) private readonly plans: Repository<Plan>,
    private readonly payments: PaymentsService,
    private readonly promos: PromosService,
    private readonly events: EventBus,
  ) {}

  async create(req: CreateSubscriptionRequest): Promise<SubscriptionDto> {
    const member = await this.members.findOne({ where: { id: req.memberId } });
    if (!member) throw new NotFoundException('Membre introuvable.');
    const plan = await this.plans.findOne({ where: { id: req.planId } });
    if (!plan) throw new NotFoundException('Offre introuvable.');
    if (!plan.isActive) throw new BadRequestException('Cette offre n’est plus proposée.');

    let startDate = req.startDate;
    if (startDate && !DATE_RE.test(startDate)) throw new BadRequestException('Date de début invalide (AAAA-MM-JJ).');
    if (!startDate) {
      // Renewal: start the day after current access ends, otherwise today.
      const today = toDateOnly();
      const current = await this.subs.find({ where: { memberId: member.id, status: SubscriptionStatus.ACTIVE } });
      const until = lastCoveredDay(accessWindows(current), today);
      startDate = until ? addDays(until, 1) : today;
    }

    let discount = 0;
    let promoCode: string | null = null;
    if (req.promoCode) {
      const quote = await this.promos.redeem(req.promoCode, plan);
      discount = quote.discount;
      promoCode = quote.code;
    }
    const price = round3(req.price ?? Math.max(0, plan.price - discount));

    const saved = await this.subs.save(
      this.subs.create({
        memberId: member.id,
        planId: plan.id,
        plan,
        startDate,
        endDate: addDays(startDate, plan.durationDays - 1),
        status: SubscriptionStatus.ACTIVE,
        price,
        promoCode,
        discount,
      }),
    );

    this.events.publish(EVENTS.subscriptionCreated, {
      subscriptionId: saved.id,
      memberId: member.id,
      memberCode: member.memberCode,
      firstName: member.firstName,
      lastName: member.lastName,
      email: member.email,
      phone: member.phone,
      planName: plan.name,
      startDate: saved.startDate,
      endDate: saved.endDate,
      price: saved.price,
    });

    if (req.payment) {
      await this.payments.create({
        memberId: member.id,
        amount: req.payment.amount ?? price,
        method: req.payment.method,
        reference: req.payment.reference,
        subscriptionId: saved.id,
        actor: req.actor,
      });
    }
    await this.publishEntitlement(member.id);
    return toSubscriptionDto(saved);
  }

  async update({ id, status, endDate }: UpdateSubscriptionRequest): Promise<SubscriptionDto> {
    const sub = await this.findOrFail(id);
    if (status === SubscriptionStatus.FROZEN) {
      throw new BadRequestException('Utilisez « Geler l’abonnement » pour une suspension temporaire.');
    }
    if (endDate !== undefined) {
      if (!DATE_RE.test(endDate) || endDate < sub.startDate) {
        throw new BadRequestException('La date de fin doit être postérieure à la date de début.');
      }
      sub.endDate = endDate;
    }
    if (status !== undefined) sub.status = status;
    const saved = await this.subs.save(sub);
    await this.publishEntitlement(saved.memberId);
    return toSubscriptionDto(saved);
  }

  async freeze({ id, days, reason }: FreezeSubscriptionRequest): Promise<SubscriptionDto> {
    const sub = await this.findOrFail(id);
    if (sub.status !== SubscriptionStatus.ACTIVE) throw new BadRequestException('Seul un abonnement actif peut être gelé.');
    if (!Number.isInteger(days) || days < 1 || days > 90) {
      throw new BadRequestException('Durée de gel invalide (1 à 90 jours).');
    }
    if (sub.endDate < toDateOnly()) throw new BadRequestException('Cet abonnement est déjà terminé.');
    Object.assign(sub, {
      status: SubscriptionStatus.FROZEN,
      frozenAt: toDateOnly(),
      frozenDays: days,
      freezeReason: reason ?? null,
    });
    const saved = await this.subs.save(sub);
    await this.publishEntitlement(saved.memberId);
    return toSubscriptionDto(saved);
  }

  /** Resumes a frozen subscription and pushes the end date back by the days actually paused. */
  async unfreeze({ id }: UnfreezeSubscriptionRequest): Promise<SubscriptionDto> {
    const sub = await this.findOrFail(id);
    if (sub.status !== SubscriptionStatus.FROZEN || !sub.frozenAt) {
      throw new BadRequestException('Cet abonnement n’est pas gelé.');
    }
    const today = toDateOnly();
    const pausedFrom = sub.frozenAt > sub.startDate ? sub.frozenAt : sub.startDate;
    const extension = Math.max(0, diffDays(pausedFrom, today));
    Object.assign(sub, {
      status: SubscriptionStatus.ACTIVE,
      endDate: addDays(sub.endDate, extension),
      frozenAt: null,
      frozenDays: null,
      freezeReason: null,
    });
    const saved = await this.subs.save(sub);
    await this.publishEntitlement(saved.memberId);
    return toSubscriptionDto(saved);
  }

  /** Broadcasts the member's full access windows; access-service replaces its copy. */
  async publishEntitlement(memberId: string): Promise<void> {
    const member = await this.members.findOne({ where: { id: memberId } });
    if (!member) return;
    const active = await this.subs.find({ where: { memberId, status: SubscriptionStatus.ACTIVE } });
    this.events.publish(EVENTS.entitlementChanged, {
      memberId,
      memberCode: member.memberCode,
      firstName: member.firstName,
      lastName: member.lastName,
      status: member.status,
      windows: accessWindows(active),
    });
  }

  private async findOrFail(id: string): Promise<Subscription> {
    const sub = await this.subs.findOne({ where: { id } });
    if (!sub) throw new NotFoundException('Abonnement introuvable.');
    return sub;
  }
}
