import { randomUUID } from 'crypto';
import { Injectable, Logger, OnApplicationBootstrap, UnauthorizedException } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource, EntityManager, IsNull, LessThan } from 'typeorm';
import { envInt } from '@app/common';
import { RefreshSession } from './refresh-session.entity';
import { RefreshClaims, judgeRefresh, refreshFamilyChanges } from './refresh-rotation';

export const SESSION_EXPIRED = 'Session expirée, reconnectez-vous.';

/** Expired or revoked families are kept this long, then deleted. */
const RETENTION_DAYS = 30;

/** Refresh token lifetime in seconds (JWT_REFRESH_TTL_DAYS, default 30 days). */
export function refreshTtlSeconds(): number {
  return Math.max(1, envInt('JWT_REFRESH_TTL_DAYS', 30)) * 86_400;
}

/** How long the token a refresh just replaced keeps working (two tabs, a retried request). */
function reuseLeewaySeconds(): number {
  return Math.max(0, envInt('REFRESH_REUSE_LEEWAY_SECONDS', 30));
}

/** Login families behind the refresh tokens: rotation, reuse detection, revocation and housekeeping. */
@Injectable()
export class RefreshSessionsService implements OnApplicationBootstrap {
  private readonly logger = new Logger(RefreshSessionsService.name);

  constructor(@InjectDataSource() private readonly dataSource: DataSource) {}

  onApplicationBootstrap(): void {
    void this.purge();
  }

  /** Starts a family (sign-in, password change); pass `manager` to join a transaction. */
  open(userId: string, manager: EntityManager = this.dataSource.manager): Promise<RefreshSession> {
    const now = new Date();
    return manager.save(
      manager.create(RefreshSession, {
        userId,
        currentJti: randomUUID(),
        previousJti: null,
        rotatedAt: null,
        expiresAt: new Date(now.getTime() + refreshTtlSeconds() * 1000),
        revokedAt: null,
        lastUsedAt: now,
      }),
    );
  }

  /**
   * Exchanges a refresh token: rotates its family, hands out the current jti again within the leeway,
   * or revokes the family when an older token is replayed. Returns the family to sign the new pair with.
   */
  async use(claims: RefreshClaims): Promise<RefreshSession> {
    const { verdict, family } = await this.dataSource.transaction('READ COMMITTED', async (manager) => {
      // Row lock: concurrent refreshes of one family are decided one after the other, each on the
      // row as the previous one committed it (READ COMMITTED), so a racing request sees the rotation.
      const family = await manager.findOne(RefreshSession, {
        where: { id: claims.fam, userId: claims.sub },
        lock: { mode: 'pessimistic_write' },
      });
      const now = new Date();
      const verdict = judgeRefresh(family, claims.jti, now, reuseLeewaySeconds());
      if (!family || verdict === 'invalid') return { verdict, family: null };
      Object.assign(family, refreshFamilyChanges(family, verdict, now, refreshTtlSeconds(), randomUUID()));
      return { verdict, family: await manager.save(family) };
    });
    if (verdict === 'reuse') {
      // Ids only: the token itself is never logged.
      this.logger.warn(`Refresh token reuse detected: user ${claims.sub}, family ${claims.fam} revoked`);
    }
    if (!family || verdict === 'reuse') throw new UnauthorizedException(SESSION_EXPIRED);
    return family;
  }

  /** Ends every family of the user; pass `manager` to join a transaction. */
  async revokeAll(userId: string, manager: EntityManager = this.dataSource.manager): Promise<void> {
    await manager.update(RefreshSession, { userId, revokedAt: IsNull() }, { revokedAt: new Date() });
  }

  /** Deletes the families expired or revoked more than 30 days ago (on boot, then every night). */
  @Cron(CronExpression.EVERY_DAY_AT_4AM)
  async purge(): Promise<void> {
    try {
      const cutoff = new Date(Date.now() - RETENTION_DAYS * 86_400_000);
      const families = this.dataSource.getRepository(RefreshSession);
      const expired = await families.delete({ expiresAt: LessThan(cutoff) });
      const revoked = await families.delete({ revokedAt: LessThan(cutoff) });
      const purged = (expired.affected ?? 0) + (revoked.affected ?? 0);
      if (purged) this.logger.log(`${purged} refresh session(s) purged`);
    } catch (err) {
      this.logger.error(`Refresh session purge failed: ${(err as Error).message}`);
    }
  }
}
