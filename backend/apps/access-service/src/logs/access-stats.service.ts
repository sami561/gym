import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { CheckinStats, LastVisit, MemberAccessInfo, TodayAccessStats, toDateOnly } from '@app/common';
import { AccessMember } from '../members/access-member.entity';
import { clampInt, gymTimezone, isDateOnly } from '../shared/validation';
import { AccessLog } from './access-log.entity';

/**
 * Check-in statistics. A check-in is a GRANTED log of a known member (manual openings by
 * staff are not visits). Days and hours are computed in the gym timezone.
 */
@Injectable()
export class AccessStatsService {
  constructor(@InjectRepository(AccessLog) private readonly logs: Repository<AccessLog>) {}

  async today(date?: string): Promise<TodayAccessStats> {
    const day = isDateOnly(date) ? date : toDateOnly();
    const [row] = await this.logs.query(
      `SELECT
         COUNT(*) FILTER (WHERE result = 'GRANTED' AND "memberId" IS NOT NULL)::int AS "checkIns",
         COUNT(DISTINCT "memberId") FILTER (WHERE result = 'GRANTED')::int AS "uniqueVisitors",
         COUNT(*) FILTER (WHERE result = 'DENIED')::int AS "denied"
       FROM access_logs
       WHERE "createdAt" >= ($2::date::timestamp AT TIME ZONE $1)
         AND "createdAt" <  (($2::date + 1)::timestamp AT TIME ZONE $1)`,
      [gymTimezone(), day],
    );
    return { checkIns: row.checkIns, uniqueVisitors: row.uniqueVisitors, denied: row.denied };
  }

  async checkins(days?: number): Promise<CheckinStats> {
    const span = clampInt(days, 1, 365, 30);
    const tz = gymTimezone();
    const daily: { date: string; count: number; unique: number }[] = await this.logs.query(
      `WITH days AS (
         SELECT generate_series((now() AT TIME ZONE $1)::date - ($2::int - 1),
                                (now() AT TIME ZONE $1)::date,
                                interval '1 day')::date AS day
       )
       SELECT to_char(d.day, 'YYYY-MM-DD') AS "date",
              COUNT(l.id)::int AS "count",
              COUNT(DISTINCT l."memberId")::int AS "unique"
       FROM days d
       LEFT JOIN access_logs l
         ON l.result = 'GRANTED' AND l."memberId" IS NOT NULL
        AND l."createdAt" >= (d.day::timestamp AT TIME ZONE $1)
        AND l."createdAt" <  ((d.day + 1)::timestamp AT TIME ZONE $1)
       GROUP BY d.day
       ORDER BY d.day`,
      [tz, span],
    );
    const hourly: { hour: number; count: number }[] = await this.logs.query(
      `SELECT h.hour::int AS "hour", COUNT(l.id)::int AS "count"
       FROM generate_series(0, 23) AS h(hour)
       LEFT JOIN access_logs l
         ON l.result = 'GRANTED' AND l."memberId" IS NOT NULL
        AND l."createdAt" >= ((((now() AT TIME ZONE $1)::date - ($2::int - 1))::timestamp) AT TIME ZONE $1)
        AND EXTRACT(HOUR FROM (l."createdAt" AT TIME ZONE $1)) = h.hour
       GROUP BY h.hour
       ORDER BY h.hour`,
      [tz, span],
    );
    return { daily, hourly };
  }

  async memberInfo(member: AccessMember | null, memberId: string): Promise<MemberAccessInfo> {
    const [row] = await this.logs.query(
      `SELECT MAX("createdAt") AS "lastVisitAt",
              COUNT(*) FILTER (
                WHERE "createdAt" >= (date_trunc('month', now() AT TIME ZONE $2) AT TIME ZONE $2)
              )::int AS "visitsThisMonth",
              COUNT(*)::int AS "totalVisits"
       FROM access_logs
       WHERE "memberId" = $1 AND result = 'GRANTED'`,
      [memberId, gymTimezone()],
    );
    return {
      memberId,
      cardNumber: member?.cardNumber ?? null,
      deviceUid: member?.deviceUid ?? null,
      lastVisitAt: row?.lastVisitAt ? new Date(row.lastVisitAt).toISOString() : null,
      visitsThisMonth: row?.visitsThisMonth ?? 0,
      totalVisits: row?.totalVisits ?? 0,
    };
  }

  /** Last granted visit per member; every requested id (or every known member) is returned. */
  async lastVisits(memberIds?: string[]): Promise<LastVisit[]> {
    const rows: { memberId: string; lastVisitAt: Date | null }[] = Array.isArray(memberIds)
      ? await this.logs.query(
          `SELECT ids."memberId", MAX(l."createdAt") AS "lastVisitAt"
           FROM unnest($1::varchar[]) AS ids("memberId")
           LEFT JOIN access_logs l ON l."memberId" = ids."memberId" AND l.result = 'GRANTED'
           GROUP BY ids."memberId"`,
          [memberIds.filter((id) => typeof id === 'string')],
        )
      : await this.logs.query(
          `SELECT m."memberId", MAX(l."createdAt") AS "lastVisitAt"
           FROM ${this.logs.manager.getRepository(AccessMember).metadata.tableName} m
           LEFT JOIN access_logs l ON l."memberId" = m."memberId" AND l.result = 'GRANTED'
           GROUP BY m."memberId"`,
        );
    return rows.map((row) => ({
      memberId: row.memberId,
      lastVisitAt: row.lastVisitAt ? new Date(row.lastVisitAt).toISOString() : null,
    }));
  }
}
