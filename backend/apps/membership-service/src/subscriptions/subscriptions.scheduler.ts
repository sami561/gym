import { Injectable, Logger, OnApplicationBootstrap } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { InjectRepository } from '@nestjs/typeorm';
import { IsNull, LessThan, LessThanOrEqual, Repository } from 'typeorm';
import {
  EVENTS,
  EventBus,
  SubscriptionStatus,
  addDays,
  diffDays,
  envInt,
  lastCoveredDay,
  toDateOnly,
} from '@app/common';
import { Subscription } from './subscription.entity';
import { SubscriptionsService } from './subscriptions.service';
import { accessWindows } from './membership-state';

/** Hourly housekeeping: expire, remind before expiry, end freezes. Idempotent. */
@Injectable()
export class SubscriptionsScheduler implements OnApplicationBootstrap {
  private readonly logger = new Logger(SubscriptionsScheduler.name);
  private running = false;

  constructor(
    @InjectRepository(Subscription) private readonly subs: Repository<Subscription>,
    private readonly subscriptions: SubscriptionsService,
    private readonly events: EventBus,
  ) {}

  onApplicationBootstrap(): void {
    setTimeout(() => void this.tick(), 5_000);
  }

  @Cron(CronExpression.EVERY_HOUR)
  async tick(): Promise<void> {
    if (this.running) return;
    this.running = true;
    try {
      await this.endFreezes();
      await this.expire();
      await this.remind();
    } catch (err) {
      this.logger.error(`Scheduler failed: ${(err as Error).message}`);
    } finally {
      this.running = false;
    }
  }

  private async endFreezes(): Promise<void> {
    const today = toDateOnly();
    const frozen = await this.subs.find({ where: { status: SubscriptionStatus.FROZEN } });
    for (const sub of frozen) {
      if (sub.frozenAt && sub.frozenDays && addDays(sub.frozenAt, sub.frozenDays) <= today) {
        await this.subscriptions.unfreeze({ id: sub.id });
      }
    }
  }

  private async expire(): Promise<void> {
    const today = toDateOnly();
    const ended = await this.subs.find({
      where: { status: SubscriptionStatus.ACTIVE, endDate: LessThan(today) },
      relations: { member: true },
    });
    for (const sub of ended) {
      sub.status = SubscriptionStatus.EXPIRED;
      await this.subs.save(sub);
      const remaining = await this.subs.find({ where: { memberId: sub.memberId, status: SubscriptionStatus.ACTIVE } });
      const renewed = remaining.some((s) => s.endDate >= today);
      if (!renewed && sub.member) {
        this.events.publish(EVENTS.subscriptionExpired, {
          subscriptionId: sub.id,
          memberId: sub.memberId,
          firstName: sub.member.firstName,
          lastName: sub.member.lastName,
          email: sub.member.email,
          phone: sub.member.phone,
          planName: sub.plan.name,
          endDate: sub.endDate,
        });
      }
      await this.subscriptions.publishEntitlement(sub.memberId);
    }
    if (ended.length) this.logger.log(`${ended.length} subscription(s) expired`);
  }

  private async remind(): Promise<void> {
    const today = toDateOnly();
    const days = envInt('EXPIRY_REMINDER_DAYS', 3);
    const ending = await this.subs.find({
      where: {
        status: SubscriptionStatus.ACTIVE,
        reminderSentAt: IsNull(),
        startDate: LessThanOrEqual(today),
        endDate: LessThanOrEqual(addDays(today, days)),
      },
      relations: { member: true },
    });
    for (const sub of ending) {
      if (sub.endDate < today) continue;
      const all = await this.subs.find({ where: { memberId: sub.memberId, status: SubscriptionStatus.ACTIVE } });
      const coveredUntil = lastCoveredDay(accessWindows(all), today);
      if (coveredUntil === sub.endDate && sub.member) {
        this.events.publish(EVENTS.subscriptionExpiring, {
          subscriptionId: sub.id,
          memberId: sub.memberId,
          firstName: sub.member.firstName,
          lastName: sub.member.lastName,
          email: sub.member.email,
          phone: sub.member.phone,
          planName: sub.plan.name,
          endDate: sub.endDate,
          daysLeft: diffDays(today, sub.endDate),
        });
      }
      sub.reminderSentAt = new Date();
      await this.subs.save(sub);
    }
  }
}
