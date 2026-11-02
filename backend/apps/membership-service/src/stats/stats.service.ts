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
      if (!indexes.has(name)) {
        values.push(params[name]);
        indexes.set(name, values.length);
      }
      return `$${indexes.get(name)}`;
    });
    return this.db.query(text, values);
  }
}
