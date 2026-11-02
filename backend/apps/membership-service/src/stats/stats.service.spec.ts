import { DataSource } from 'typeorm';
import { StatsService } from './stats.service';

type Row = Record<string, unknown>;

/** DataSource double: answers the queries in call order and records the SQL text and values sent to pg. */
function setup(...answers: Row[][]) {
  const query = jest.fn(async (_text: string, _values: unknown[]) => answers.shift() ?? []);
  const service = new StatsService({ query } as unknown as DataSource);
  const call = (index: number) => ({ text: query.mock.calls[index][0], values: query.mock.calls[index][1] });
  return { service, query, call };
}

const tz = process.env.TZ ?? 'Africa/Tunis';

describe('StatsService (membership KPIs and lists, gym days in Africa/Tunis)', () => {
  beforeEach(() => jest.useFakeTimers({ now: new Date(2026, 10, 15, 10, 30) })); // 15 Nov 2026, 10:30 in Tunis
  afterEach(() => jest.useRealTimers());

  describe('named SQL parameters', () => {
    it('numbers each parameter once, reuses it and leaves ::casts alone', async () => {
      const { service, call } = setup([{ totalMembers: '3' }]);
      await service.summary();
      const { text, values } = call(0);
      expect(text).not.toMatch(/(?<!:):[a-zA-Z]/);
      // In order of first appearance: today, monthStart, horizon, lastMonthStart, dayStart.
      expect(values).toEqual(['2026-11-15', new Date(2026, 10, 1), '2026-11-22', new Date(2026, 9, 1), new Date(2026, 10, 15)]);
      expect(text.match(/\$1\b/g)?.length).toBeGreaterThan(1);

      const analytics = setup([{}], [], [], []);
      await analytics.service.analytics();
      expect(analytics.call(1).text).toContain('gender::text');
      expect(analytics.call(1).values).toEqual([]);
    });
  });

  describe('summary', () => {
    it('converts the counters and sums (pg strings) to numbers, 0 when missing', async () => {
      const { service } = setup([
        { totalMembers: '120', activeMembers: '87', newThisMonth: '9', expiringSoon: '4', revenueThisMonth: '7830.500', revenueLastMonth: null },
      ]);
      expect(await service.summary()).toEqual({
        totalMembers: 120,
        activeMembers: 87,
        newThisMonth: 9,
        expiringSoon: 4,
        revenueThisMonth: 7830.5,
        revenueLastMonth: 0,
        revenueToday: 0,
      });
    });
  });

  describe('kpis (membership half of GMV / NMV)', () => {
    it('lists every month of the period and nets discounts and cancellations', async () => {
      const { service, call } = setup(
        [
          { month: '2026-10', gross: '900.000', discounts: '45.000', cancelled: '90.000' },
          { month: '2026-11', gross: '0.3', discounts: '0.1', cancelled: '0' },
        ],
        [{ month: '2026-10', cash: '700.500' }],
        [{ mrr: '2567.12345', activeMembers: '3' }],
      );

      const kpis = await service.kpis({ from: '2026-09-20', to: '2026-11-14' });

      expect(kpis.monthly).toEqual([
        { month: '2026-09', gross: 0, discounts: 0, cancelled: 0, net: 0, cash: 0 },
        { month: '2026-10', gross: 900, discounts: 45, cancelled: 90, net: 765, cash: 700.5 },
        { month: '2026-11', gross: 0.3, discounts: 0.1, cancelled: 0, net: 0.2, cash: 0 },
      ]);
      expect(kpis).toMatchObject({
        gross: 900.3,
        discounts: 45.1,
        cancelled: 90,
        net: 765.2,
        cashCollected: 700.5,
        mrr: 2567.123,
        activeMembers: 3,
        arpu: 255.067,
      });
      // [from, to] are whole gym days: local midnight of `from` up to local midnight after `to`.
      expect(call(0).values).toEqual([tz, new Date(2026, 8, 20), new Date(2026, 10, 15)]);
    });

    it('defaults to the current month up to today, with ARPU 0 without active members', async () => {
      const { service, call } = setup([], [], [{ mrr: null, activeMembers: '0' }]);
      const kpis = await service.kpis({});
      expect(kpis.monthly.map((m) => m.month)).toEqual(['2026-11']);
      expect(kpis.arpu).toBe(0);
      expect(kpis.mrr).toBe(0);
      expect(call(0).values).toEqual([tz, new Date(2026, 10, 1), new Date(2026, 10, 16)]);
      expect(call(2).values).toEqual(['2026-11-15']);
    });

    it('includes the month of the last day only when the period reaches it', async () => {
      const { service } = setup([], [], [{ mrr: '0', activeMembers: '0' }]);
      expect((await service.kpis({ from: '2026-10-01', to: '2026-10-31' })).monthly.map((m) => m.month)).toEqual(['2026-10']);
    });
  });

  describe('revenue', () => {
    it('fills every month with zeros, oldest first, within 1..36 months', async () => {
      const { service, call } = setup([{ month: '2026-10', total: '2400.000', count: '20' }]);
      expect(await service.revenue({ months: 3 })).toEqual([
        { month: '2026-09', total: 0, count: 0 },
        { month: '2026-10', total: 2400, count: 20 },
        { month: '2026-11', total: 0, count: 0 },
      ]);
      expect(call(0).values).toEqual([tz, new Date(2026, 8, 1)]);
      expect(await setup([]).service.revenue({ months: 0 })).toHaveLength(1);
      expect(await setup([]).service.revenue({ months: 100 })).toHaveLength(36);
      expect(await setup([]).service.revenue({})).toHaveLength(12);
    });
  });

  describe('analytics', () => {
    it('orders genders and age groups, fills 12 months and rounds the renewal rate', async () => {
      const { service } = setup(
        [{ total: '10', active: '6', expired: '2', suspended: '1', frozen: '1', neverSubscribed: '1', churned: '2', ended90: '3', renewed90: '2' }],
        [{ gender: 'FEMALE', count: '4' }, { gender: 'UNKNOWN', count: '1' }],
        [{ label: 'Non renseigné', count: '1' }, { label: '25-34', count: '5' }],
        [{ month: '2026-11', count: '2' }, { month: '2025-12', count: '1' }],
      );
      const analytics = await service.analytics();
      expect(analytics).toMatchObject({ total: 10, active: 6, expired: 2, suspended: 1, frozen: 1, neverSubscribed: 1, churnedLast30d: 2 });
      expect(analytics.renewalRate90d).toBe(0.667);
      expect(analytics.byGender).toEqual([
        { gender: 'MALE', count: 0 },
        { gender: 'FEMALE', count: 4 },
        { gender: 'UNKNOWN', count: 1 },
      ]);
      expect(analytics.byAgeGroup.map((g) => g.label)).toEqual(['< 18', '18-24', '25-34', '35-44', '45-54', '55+', 'Non renseigné']);
      expect(analytics.byAgeGroup.find((g) => g.label === '25-34')?.count).toBe(5);
      expect(analytics.newPerMonth).toHaveLength(12);
      expect(analytics.newPerMonth[0]).toEqual({ month: '2025-12', count: 1 });
      expect(analytics.newPerMonth[11]).toEqual({ month: '2026-11', count: 2 });
    });

    it('reports a renewal rate of 0 when nothing ended in 90 days', async () => {
      const { service } = setup([{ ended90: '0', renewed90: '0' }], [], [], []);
      expect((await service.analytics()).renewalRate90d).toBe(0);
    });
  });

  describe('member lists for automations', () => {
    it('lists expiring members by end date with the days left', async () => {
      const { service, call } = setup([
        { memberId: 'm-2', memberCode: 'MEL-00002', firstName: 'Yassine', lastName: 'T', email: 'y@example.com', phone: null, planName: 'Mensuel', endDate: new Date(2026, 10, 20) },
        { memberId: 'm-1', memberCode: 'MEL-00001', firstName: 'Amira', lastName: 'B', email: 'a@example.com', phone: null, planName: 'Mensuel', endDate: new Date(2026, 10, 15) },
      ]);
      const items = await service.expiring({ days: 7 });
      expect(items.map((i) => [i.memberId, i.endDate, i.daysLeft])).toEqual([
        ['m-1', '2026-11-15', 0],
        ['m-2', '2026-11-20', 5],
      ]);
      expect(call(0).values).toEqual(['2026-11-15', '2026-11-22']);
      await service.expiring({ days: -3 });
      expect(call(1).values).toEqual(['2026-11-15', '2026-11-15']);
    });

    it('lists recently expired members with the days since expiry', async () => {
      const { service, call } = setup([
        { memberId: 'm-1', firstName: 'Amira', lastName: 'B', email: 'a@example.com', phone: null, planName: 'Mensuel', endDate: new Date(2026, 10, 12) },
      ]);
      expect(await service.expired({ days: 7 })).toEqual([
        { memberId: 'm-1', firstName: 'Amira', lastName: 'B', email: 'a@example.com', phone: null, planName: 'Mensuel', endDate: '2026-11-12', daysSinceExpiry: 3 },
      ]);
      expect(call(0).values).toEqual(['2026-11-08', '2026-11-15']); // from, today
      await service.expired({ days: 0 });
      expect(call(1).values).toEqual(['2026-11-14', '2026-11-15']);
    });

    it('finds today’s birthdays (MM-DD in Tunis) and computes the age', async () => {
      const { service, call } = setup([
        { memberId: 'm-1', firstName: 'Amira', lastName: 'B', email: 'a@example.com', phone: null, birthDate: new Date(1996, 10, 15) },
      ]);
      expect(await service.birthdays()).toEqual([
        { memberId: 'm-1', firstName: 'Amira', lastName: 'B', email: 'a@example.com', phone: null, age: 30 },
      ]);
      expect(call(0).values).toEqual(['11-15']);
    });

    it('builds yesterday’s daily report over whole gym days', async () => {
      const { service, call } = setup([{ revenue: '450.250', payments: '5', newMembers: '2', newSubscriptions: '3', expiringNext7Days: '4' }]);
      expect(await service.dailyReport({})).toEqual({
        date: '2026-11-14',
        revenue: 450.25,
        payments: 5,
        newMembers: 2,
        newSubscriptions: 3,
        expiringNext7Days: 4,
      });
      expect(call(0).values).toEqual([new Date(2026, 10, 14), new Date(2026, 10, 15), '2026-11-15', '2026-11-22']);
    });
  });
});
