import { Injectable } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import {
  BirthdayItem,
  DailyMembershipReport,
  DailyReportRequest,
  ExpiredItem,
  ExpiredRequest,
  ExpiringItem,
  ExpiringRequest,
  KpiPeriodRequest,
  MembersAnalytics,
  MembershipKpis,
  MembershipSummary,
  PlanMixItem,
  Recipient,
  RecipientsRequest,
  RevenuePoint,
  RevenueRequest,
  addDays,
  addMonths,
  diffDays,
  monthKey,
  parseDateOnly,
  startOfDay,
  startOfMonth,
  toDateOnly,
} from '@app/common';

/** Member has an ACTIVE subscription covering :today. */
const COVERED = `EXISTS (SELECT 1 FROM subscriptions c WHERE c."memberId" = m.id AND c.status = 'ACTIVE'
  AND c."startDate" <= :today AND c."endDate" >= :today)`;

/** Active subscriptions ending within [today, horizon] with no later active renewal. */
const ENDING = `FROM subscriptions s
  JOIN members m ON m.id = s."memberId"
  JOIN plans p ON p.id = s."planId"
  WHERE s.status = 'ACTIVE' AND m.status = 'ACTIVE' AND s."startDate" <= :today
    AND s."endDate" BETWEEN :today AND :horizon
    AND NOT EXISTS (SELECT 1 FROM subscriptions r WHERE r."memberId" = s."memberId"
      AND r.status = 'ACTIVE' AND r."endDate" > s."endDate")`;

const num = (v: unknown) => Number(v ?? 0);

@Injectable()
export class StatsService {
  constructor(@InjectDataSource() private readonly db: DataSource) {}

  async summary(): Promise<MembershipSummary> {
    const today = toDateOnly();
    const now = new Date();
    const monthStart = startOfMonth(now);
    const [row] = await this.query(
      `SELECT
        (SELECT COUNT(*) FROM members) AS "totalMembers",
        (SELECT COUNT(*) FROM members m WHERE m.status = 'ACTIVE' AND ${COVERED}) AS "activeMembers",
        (SELECT COUNT(*) FROM members WHERE "joinedAt" >= :monthStart) AS "newThisMonth",
        (SELECT COUNT(DISTINCT s."memberId") ${ENDING}) AS "expiringSoon",
        (SELECT COALESCE(SUM(amount), 0) FROM payments WHERE "paidAt" >= :monthStart) AS "revenueThisMonth",
        (SELECT COALESCE(SUM(amount), 0) FROM payments WHERE "paidAt" >= :lastMonthStart AND "paidAt" < :monthStart) AS "revenueLastMonth",
        (SELECT COALESCE(SUM(amount), 0) FROM payments WHERE "paidAt" >= :dayStart) AS "revenueToday"`,
      {
        today,
        horizon: addDays(today, 7),
        monthStart,
        lastMonthStart: addMonths(monthStart, -1),
        dayStart: startOfDay(now),
      },
    );
    return {
      totalMembers: num(row.totalMembers),
      activeMembers: num(row.activeMembers),
      newThisMonth: num(row.newThisMonth),
      expiringSoon: num(row.expiringSoon),
      revenueThisMonth: num(row.revenueThisMonth),
      revenueLastMonth: num(row.revenueLastMonth),
      revenueToday: num(row.revenueToday),
    };
  }

  async analytics(): Promise<MembersAnalytics> {
    const today = toDateOnly();
    const tz = process.env.TZ ?? 'Africa/Tunis';
    const start = addMonths(startOfMonth(), -11);
    const [counts] = await this.query(
      `SELECT
        (SELECT COUNT(*) FROM members) AS total,
        (SELECT COUNT(*) FROM members m WHERE m.status = 'ACTIVE' AND ${COVERED}) AS active,
        (SELECT COUNT(*) FROM members m WHERE m.status = 'ACTIVE' AND NOT ${COVERED}
           AND EXISTS (SELECT 1 FROM subscriptions x WHERE x."memberId" = m.id)) AS expired,
        (SELECT COUNT(*) FROM members WHERE status = 'SUSPENDED') AS suspended,
        (SELECT COUNT(DISTINCT "memberId") FROM subscriptions WHERE status = 'FROZEN') AS frozen,
        (SELECT COUNT(*) FROM members m WHERE NOT EXISTS (SELECT 1 FROM subscriptions x WHERE x."memberId" = m.id)) AS "neverSubscribed",
        (SELECT COUNT(DISTINCT s."memberId") FROM subscriptions s
          WHERE s."endDate" >= :since30 AND s."endDate" < :today AND s.status IN ('ACTIVE', 'EXPIRED')
            AND NOT EXISTS (SELECT 1 FROM subscriptions r WHERE r."memberId" = s."memberId"
              AND r.status IN ('ACTIVE', 'FROZEN') AND r."endDate" >= :today)) AS churned,
        (SELECT COUNT(*) FROM subscriptions s WHERE s."endDate" >= :since90 AND s."endDate" < :today
            AND s.status IN ('ACTIVE', 'EXPIRED')) AS ended90,
        (SELECT COUNT(*) FROM subscriptions s WHERE s."endDate" >= :since90 AND s."endDate" < :today
            AND s.status IN ('ACTIVE', 'EXPIRED')
            AND EXISTS (SELECT 1 FROM subscriptions r WHERE r."memberId" = s."memberId"
              AND r.id <> s.id AND r."startDate" > s."startDate" AND r.status <> 'CANCELLED')) AS renewed90`,
      { today, since30: addDays(today, -30), since90: addDays(today, -90) },
    );
    const genders = await this.query(
      `SELECT COALESCE(gender::text, 'UNKNOWN') AS gender, COUNT(*) AS count FROM members GROUP BY 1`,
      {},
    );
    const ages = await this.query(
      `SELECT CASE
          WHEN "birthDate" IS NULL THEN 'Non renseigné'
          WHEN date_part('year', age("birthDate")) < 18 THEN '< 18'
          WHEN date_part('year', age("birthDate")) < 25 THEN '18-24'
          WHEN date_part('year', age("birthDate")) < 35 THEN '25-34'
          WHEN date_part('year', age("birthDate")) < 45 THEN '35-44'
          WHEN date_part('year', age("birthDate")) < 55 THEN '45-54'
          ELSE '55+' END AS label, COUNT(*) AS count
         FROM members GROUP BY 1`,
      {},
    );
    const joined = await this.query(
      `SELECT to_char(date_trunc('month', "joinedAt" AT TIME ZONE :tz), 'YYYY-MM') AS month, COUNT(*) AS count
         FROM members WHERE "joinedAt" >= :start GROUP BY 1`,
      { tz, start },
    );
    const ageOrder = ['< 18', '18-24', '25-34', '35-44', '45-54', '55+', 'Non renseigné'];
    const joinedByMonth = new Map(joined.map((r) => [r.month as string, num(r.count)]));
    const ended90 = num(counts.ended90);
    return {
      total: num(counts.total),
      active: num(counts.active),
      expired: num(counts.expired),
      suspended: num(counts.suspended),
      frozen: num(counts.frozen),
      neverSubscribed: num(counts.neverSubscribed),
      byGender: (['MALE', 'FEMALE', 'UNKNOWN'] as const).map((gender) => ({
        gender,
        count: num(genders.find((g) => g.gender === gender)?.count),
      })),
      byAgeGroup: ageOrder.map((label) => ({ label, count: num(ages.find((a) => a.label === label)?.count) })),
      newPerMonth: Array.from({ length: 12 }, (_, i) => {
        const month = monthKey(addMonths(start, i));
        return { month, count: joinedByMonth.get(month) ?? 0 };
      }),
      churnedLast30d: num(counts.churned),
      renewalRate90d: ended90 ? Math.round((num(counts.renewed90) / ended90) * 1000) / 1000 : 0,
    };
  }

  /** Membership half of GMV / NMV: subscriptions sold in [from, to] (inclusive dates). */
  async kpis({ from, to }: KpiPeriodRequest): Promise<MembershipKpis> {
    const end = to ?? toDateOnly();
    const start = from ?? `${end.slice(0, 7)}-01`;
    const tz = process.env.TZ ?? 'Africa/Tunis';
    const range = { start: parseDateOnly(start), end: parseDateOnly(addDays(end, 1)), today: toDateOnly(), tz };
    const sold = await this.query(
      `SELECT to_char(date_trunc('month', s."createdAt" AT TIME ZONE :tz), 'YYYY-MM') AS month,
              COALESCE(SUM(s.price + s.discount), 0) AS gross,
              COALESCE(SUM(s.discount), 0) AS discounts,
              COALESCE(SUM(CASE WHEN s.status = 'CANCELLED' THEN s.price ELSE 0 END), 0) AS cancelled
         FROM subscriptions s WHERE s."createdAt" >= :start AND s."createdAt" < :end GROUP BY 1`,
      range,
    );
    const cash = await this.query(
      `SELECT to_char(date_trunc('month', "paidAt" AT TIME ZONE :tz), 'YYYY-MM') AS month, SUM(amount) AS cash
         FROM payments WHERE "paidAt" >= :start AND "paidAt" < :end GROUP BY 1`,
      range,
    );
    const [recurring] = await this.query(
      `SELECT COALESCE(SUM(s.price / GREATEST(p."durationDays", 1) * 30), 0) AS mrr,
              COUNT(DISTINCT s."memberId") AS "activeMembers"
         FROM subscriptions s
         JOIN plans p ON p.id = s."planId"
         JOIN members m ON m.id = s."memberId"
        WHERE s.status = 'ACTIVE' AND m.status = 'ACTIVE' AND s."startDate" <= :today AND s."endDate" >= :today`,
      range,
    );

    const months: string[] = [];
    for (let m = startOfMonth(parseDateOnly(start)); m < range.end; m = addMonths(m, 1)) months.push(monthKey(m));
    const r3 = (n: number) => Math.round(n * 1000) / 1000;
    const monthly = months.map((month) => {
      const row = sold.find((x) => x.month === month);
      const gross = num(row?.gross);
      const discounts = num(row?.discounts);
      const cancelled = num(row?.cancelled);
      return {
        month,
        gross: r3(gross),
        discounts: r3(discounts),
        cancelled: r3(cancelled),
        net: r3(gross - discounts - cancelled),
        cash: r3(num(cash.find((x) => x.month === month)?.cash)),
      };
    });
    const sum = (key: 'gross' | 'discounts' | 'cancelled' | 'net' | 'cash') =>
      r3(monthly.reduce((acc, m) => acc + m[key], 0));
    const activeMembers = num(recurring.activeMembers);
    const net = sum('net');
    return {
      gross: sum('gross'),
      discounts: sum('discounts'),
      cancelled: sum('cancelled'),
      net,
      cashCollected: sum('cash'),
      mrr: r3(num(recurring.mrr)),
      activeMembers,
      arpu: activeMembers ? r3(net / activeMembers) : 0,
      monthly,
    };
  }

  async revenue({ months = 12 }: RevenueRequest): Promise<RevenuePoint[]> {
    const count = Math.min(36, Math.max(1, months));
    const start = addMonths(startOfMonth(), -(count - 1));
    const rows = await this.query(
      `SELECT to_char(date_trunc('month', "paidAt" AT TIME ZONE :tz), 'YYYY-MM') AS month,
              SUM(amount) AS total, COUNT(*) AS count
         FROM payments WHERE "paidAt" >= :start GROUP BY 1`,
      { tz: process.env.TZ ?? 'Africa/Tunis', start },
    );
    const byMonth = new Map(rows.map((r) => [r.month as string, r]));
    return Array.from({ length: count }, (_, i) => {
      const month = monthKey(addMonths(start, i));
      const row = byMonth.get(month);
      return { month, total: num(row?.total), count: num(row?.count) };
    });
  }

  async expiring({ days = 7 }: ExpiringRequest): Promise<ExpiringItem[]> {
    const today = toDateOnly();
    const rows = await this.query(
      `SELECT DISTINCT ON (s."memberId") m.id AS "memberId", m."memberCode", m."firstName", m."lastName",
              m.email, m.phone, p.name AS "planName", s."endDate"
       ${ENDING} ORDER BY s."memberId", s."endDate" DESC`,
      { today, horizon: addDays(today, Math.max(0, days)) },
    );
    return rows
      .map((r) => ({
        memberId: r.memberId,
        memberCode: r.memberCode,
        firstName: r.firstName,
        lastName: r.lastName,
        email: r.email,
        phone: r.phone,
        planName: r.planName,
        endDate: toDateOnly(new Date(r.endDate)),
        daysLeft: diffDays(today, toDateOnly(new Date(r.endDate))),
      }))
      .sort((a, b) => a.endDate.localeCompare(b.endDate));
  }

  async planMix(): Promise<PlanMixItem[]> {
    const rows = await this.query(
      `SELECT p.id AS "planId", p.name AS "planName", COUNT(DISTINCT s."memberId") AS "activeCount"
         FROM subscriptions s JOIN plans p ON p.id = s."planId"
        WHERE s.status = 'ACTIVE' AND s."startDate" <= :today AND s."endDate" >= :today
        GROUP BY p.id, p.name ORDER BY "activeCount" DESC`,
      { today: toDateOnly() },
    );
    return rows.map((r) => ({ planId: r.planId, planName: r.planName, activeCount: num(r.activeCount) }));
  }

  async recipients({ segment = 'active' }: RecipientsRequest): Promise<Recipient[]> {
    const where =
      segment === 'active'
        ? `m.status = 'ACTIVE' AND ${COVERED}`
        : segment === 'expired'
          ? `m.status = 'ACTIVE' AND NOT ${COVERED} AND EXISTS (SELECT 1 FROM subscriptions x WHERE x."memberId" = m.id)`
          : `m.status = 'ACTIVE'`;
    const rows = await this.query(
      `SELECT m.id AS "memberId", m."firstName", m."lastName", m.email, m.phone
         FROM members m WHERE ${where} ORDER BY m."lastName", m."firstName"`,
      { today: toDateOnly() },
    );
    return rows as Recipient[];
  }

  async birthdays(): Promise<BirthdayItem[]> {
    const today = new Date();
    const rows = await this.query(
      `SELECT m.id AS "memberId", m."firstName", m."lastName", m.email, m.phone, m."birthDate"
         FROM members m
        WHERE m.status = 'ACTIVE' AND m."birthDate" IS NOT NULL AND to_char(m."birthDate", 'MM-DD') = :mmdd`,
      { mmdd: toDateOnly(today).slice(5) },
    );
    return rows.map((r) => ({
      memberId: r.memberId,
      firstName: r.firstName,
      lastName: r.lastName,
      email: r.email,
      phone: r.phone,
      age: today.getFullYear() - new Date(r.birthDate).getFullYear(),
    }));
  }

  async expired({ days = 7 }: ExpiredRequest): Promise<ExpiredItem[]> {
    const today = toDateOnly();
    const rows = await this.query(
      `SELECT DISTINCT ON (m.id) m.id AS "memberId", m."firstName", m."lastName", m.email, m.phone,
              p.name AS "planName", s."endDate"
         FROM subscriptions s
         JOIN members m ON m.id = s."memberId"
         JOIN plans p ON p.id = s."planId"
        WHERE s.status IN ('ACTIVE', 'EXPIRED') AND m.status = 'ACTIVE'
          AND s."endDate" >= :from AND s."endDate" < :today
          AND NOT EXISTS (SELECT 1 FROM subscriptions r WHERE r."memberId" = m.id
            AND r.status IN ('ACTIVE', 'FROZEN') AND r."endDate" >= :today)
        ORDER BY m.id, s."endDate" DESC`,
      { today, from: addDays(today, -Math.max(1, days)) },
    );
    return rows.map((r) => {
      const endDate = toDateOnly(new Date(r.endDate));
      return {
        memberId: r.memberId,
        firstName: r.firstName,
        lastName: r.lastName,
        email: r.email,
        phone: r.phone,
        planName: r.planName,
        endDate,
        daysSinceExpiry: diffDays(endDate, today),
      };
    });
  }

  async dailyReport({ date }: DailyReportRequest): Promise<DailyMembershipReport> {
    const day = date ?? addDays(toDateOnly(), -1);
    const start = parseDateOnly(day);
    const end = parseDateOnly(addDays(day, 1));
    const today = toDateOnly();
    const [row] = await this.query(
      `SELECT
        (SELECT COALESCE(SUM(amount), 0) FROM payments WHERE "paidAt" >= :start AND "paidAt" < :end) AS revenue,
        (SELECT COUNT(*) FROM payments WHERE "paidAt" >= :start AND "paidAt" < :end) AS payments,
        (SELECT COUNT(*) FROM members WHERE "joinedAt" >= :start AND "joinedAt" < :end) AS "newMembers",
        (SELECT COUNT(*) FROM subscriptions WHERE "createdAt" >= :start AND "createdAt" < :end) AS "newSubscriptions",
        (SELECT COUNT(DISTINCT s."memberId") ${ENDING}) AS "expiringNext7Days"`,
      { start, end, today, horizon: addDays(today, 7) },
    );
    return {
      date: day,
      revenue: num(row.revenue),
      payments: num(row.payments),
      newMembers: num(row.newMembers),
      newSubscriptions: num(row.newSubscriptions),
      expiringNext7Days: num(row.expiringNext7Days),
    };
  }

  /** Runs SQL written with :named parameters (converted to $n for pg). */
  private query(sql: string, params: Record<string, unknown>): Promise<Record<string, any>[]> {
    const values: unknown[] = [];
    const indexes = new Map<string, number>();
    const text = sql.replace(/(?<!:):([a-zA-Z]\w*)/g, (_, name: string) => {
      if (!(name in params)) return `:${name}`;
      let index = indexes.get(name);
      if (index === undefined) {
        values.push(params[name]);
        index = values.length;
        indexes.set(name, index);
      }
      return `$${index}`;
    });
    return this.db.query(text, values);
  }
}
