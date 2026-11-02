import { Logger } from '@nestjs/common';
import { FindOperator, Repository } from 'typeorm';
import { EVENTS, EventBus, MemberStatus, SubscriptionStatus } from '@app/common';
import { Member } from '../members/member.entity';
import { Plan } from '../plans/plan.entity';
import { Subscription } from './subscription.entity';
import { SubscriptionsScheduler } from './subscriptions.scheduler';
import { SubscriptionsService } from './subscriptions.service';

const monthly = Object.assign(new Plan(), { id: 'plan-1', name: 'Mensuel', durationDays: 30, price: 90 });

function person(id: string, firstName: string): Member {
  return Object.assign(new Member(), {
    id,
    memberCode: `MEL-${id}`,
    firstName,
    lastName: 'Test',
    email: `${firstName.toLowerCase()}@example.com`,
    phone: null,
    status: MemberStatus.ACTIVE,
  });
}

let nextId = 0;
function sub(member: Member | null, startDate: string, endDate: string, overrides: Partial<Subscription> = {}): Subscription {
  nextId += 1;
  return Object.assign(new Subscription(), {
    id: `s-${nextId}`,
    memberId: member?.id ?? 'm-gone',
    member,
    planId: 'plan-1',
    plan: monthly,
    startDate,
    endDate,
    status: SubscriptionStatus.ACTIVE,
    frozenAt: null,
    frozenDays: null,
    reminderSentAt: null,
    ...overrides,
  });
}

/** Evaluates the `where` objects the scheduler uses (equality, LessThan, LessThanOrEqual, IsNull). */
function matches(row: Subscription, where: Record<string, unknown>): boolean {
  return Object.entries(where).every(([key, expected]) => {
    const actual = (row as unknown as Record<string, unknown>)[key];
    if (!(expected instanceof FindOperator)) return actual === expected;
    switch (expected.type) {
      case 'lessThan':
        return (actual as string) < expected.value;
      case 'lessThanOrEqual':
        return (actual as string) <= expected.value;
      case 'isNull':
        return actual === null || actual === undefined;
      default:
        throw new Error(`operator ${expected.type} not supported by the test repository`);
    }
  });
}

function setup(rows: Subscription[]) {
  const repo = {
    find: jest.fn(async ({ where }: { where: Record<string, unknown> }) => rows.filter((row) => matches(row, where))),
    save: jest.fn(async (row: Subscription) => row),
  };
  const subscriptions = { unfreeze: jest.fn().mockResolvedValue({}), publishEntitlement: jest.fn().mockResolvedValue(undefined) };
  const events = { publish: jest.fn() };
  const scheduler = new SubscriptionsScheduler(
    repo as unknown as Repository<Subscription>,
    subscriptions as unknown as SubscriptionsService,
    events as unknown as EventBus,
  );
  const published = (event: string) => events.publish.mock.calls.filter(([name]) => name === event).map(([, data]) => data);
  return { scheduler, repo, subscriptions, events, published };
}

describe('SubscriptionsScheduler (hourly: end freezes, expire, remind)', () => {
  const amira = person('m-1', 'Amira');
  const yassine = person('m-2', 'Yassine');

  beforeEach(() => {
    jest.useFakeTimers({ now: new Date(2026, 10, 2, 10, 0) }); // 2 Nov 2026, 10:00 in Tunis
    jest.spyOn(Logger.prototype, 'log').mockImplementation(() => undefined);
    jest.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined);
  });
  afterEach(() => {
    jest.useRealTimers();
    jest.restoreAllMocks();
    delete process.env.EXPIRY_REMINDER_DAYS;
  });

  it('ends a freeze once its days have passed', async () => {
    const due = sub(amira, '2026-10-10', '2026-11-08', { status: SubscriptionStatus.FROZEN, frozenAt: '2026-10-19', frozenDays: 14 });
    const running = sub(yassine, '2026-10-10', '2026-11-08', { status: SubscriptionStatus.FROZEN, frozenAt: '2026-10-20', frozenDays: 14 });
    const { scheduler, subscriptions } = setup([due, running]);
    await scheduler.tick();
    expect(subscriptions.unfreeze).toHaveBeenCalledTimes(1);
    expect(subscriptions.unfreeze).toHaveBeenCalledWith({ id: due.id });
  });

  describe('expiry', () => {
    it('expires subscriptions that ended yesterday and tells the member', async () => {
      const ended = sub(amira, '2026-10-02', '2026-11-01');
      const endsToday = sub(yassine, '2026-10-04', '2026-11-02');
      const { scheduler, subscriptions, published } = setup([ended, endsToday]);
      await scheduler.tick();

      expect(ended.status).toBe(SubscriptionStatus.EXPIRED);
      expect(endsToday.status).toBe(SubscriptionStatus.ACTIVE);
      expect(published(EVENTS.subscriptionExpired)).toEqual([
        {
          subscriptionId: ended.id,
          memberId: 'm-1',
          firstName: 'Amira',
          lastName: 'Test',
          email: 'amira@example.com',
          phone: null,
          planName: 'Mensuel',
          endDate: '2026-11-01',
        },
      ]);
      expect(subscriptions.publishEntitlement).toHaveBeenCalledWith('m-1');
    });

    it('stays silent when a renewal already covers today, but still refreshes the doors', async () => {
      const ended = sub(amira, '2026-10-02', '2026-11-01');
      const renewal = sub(amira, '2026-11-02', '2026-12-01', { reminderSentAt: new Date() });
      const { scheduler, subscriptions, published } = setup([ended, renewal]);
      await scheduler.tick();
      expect(ended.status).toBe(SubscriptionStatus.EXPIRED);
      expect(published(EVENTS.subscriptionExpired)).toEqual([]);
      expect(subscriptions.publishEntitlement).toHaveBeenCalledWith('m-1');
    });

    it('expires without a message when the member is gone', async () => {
      const orphan = sub(null, '2026-10-02', '2026-11-01');
      const { scheduler, published } = setup([orphan]);
      await scheduler.tick();
      expect(orphan.status).toBe(SubscriptionStatus.EXPIRED);
      expect(published(EVENTS.subscriptionExpired)).toEqual([]);
    });
  });

  describe('reminders before expiry', () => {
    it('reminds once, up to 3 days ahead by default, with the days left', async () => {
      const inTwoDays = sub(amira, '2026-10-06', '2026-11-04');
      const inThreeDays = sub(yassine, '2026-10-07', '2026-11-05');
      const inFourDays = sub(person('m-3', 'Sarra'), '2026-10-08', '2026-11-06');
      const { scheduler, published } = setup([inTwoDays, inThreeDays, inFourDays]);
      await scheduler.tick();

      expect(published(EVENTS.subscriptionExpiring)).toEqual([
        expect.objectContaining({ subscriptionId: inTwoDays.id, endDate: '2026-11-04', daysLeft: 2, email: 'amira@example.com' }),
        expect.objectContaining({ subscriptionId: inThreeDays.id, endDate: '2026-11-05', daysLeft: 3 }),
      ]);
      expect(inTwoDays.reminderSentAt).toBeInstanceOf(Date);
      expect(inFourDays.reminderSentAt).toBeNull();

      await scheduler.tick();
      expect(published(EVENTS.subscriptionExpiring)).toHaveLength(2);
    });

    it('does not remind a member whose renewal follows, but marks the reminder as handled', async () => {
      const ending = sub(amira, '2026-10-06', '2026-11-04');
      const renewal = sub(amira, '2026-11-05', '2026-12-04');
      const { scheduler, published } = setup([ending, renewal]);
      await scheduler.tick();
      expect(published(EVENTS.subscriptionExpiring)).toEqual([]);
      expect(ending.reminderSentAt).toBeInstanceOf(Date);
    });

    it('reminds the renewal itself once it has started', async () => {
      const current = sub(amira, '2026-10-01', '2026-10-31');
      const renewal = sub(amira, '2026-11-01', '2026-11-03');
      const { scheduler, published } = setup([current, renewal]);
      await scheduler.tick();
      expect(published(EVENTS.subscriptionExpiring)).toEqual([
        expect.objectContaining({ subscriptionId: renewal.id, endDate: '2026-11-03', daysLeft: 1 }),
      ]);
    });

    it('skips renewals that have not started and honours EXPIRY_REMINDER_DAYS', async () => {
      process.env.EXPIRY_REMINDER_DAYS = '7';
      const inSixDays = sub(amira, '2026-10-10', '2026-11-08');
      const future = sub(yassine, '2026-11-03', '2026-11-04');
      const { scheduler, published } = setup([inSixDays, future]);
      await scheduler.tick();
      expect(published(EVENTS.subscriptionExpiring)).toEqual([expect.objectContaining({ subscriptionId: inSixDays.id, daysLeft: 6 })]);
      expect(future.reminderSentAt).toBeNull();
    });
  });

  it('never runs twice at once and survives a failing run', async () => {
    const { scheduler, repo } = setup([]);
    let release!: () => void;
    repo.find.mockImplementationOnce(() => new Promise((resolve) => (release = () => resolve([]))));
    const first = scheduler.tick();
    await scheduler.tick(); // returns at once: a run is in progress
    expect(repo.find).toHaveBeenCalledTimes(1);
    release();
    await first;

    repo.find.mockRejectedValueOnce(new Error('connection lost'));
    await expect(scheduler.tick()).resolves.toBeUndefined();
    expect(Logger.prototype.error).toHaveBeenCalledWith('Scheduler failed: connection lost');
  });
});
