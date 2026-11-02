import { ConflictException, Injectable, Logger, NotFoundException, OnApplicationBootstrap } from '@nestjs/common';
import { Interval } from '@nestjs/schedule';
import { InjectRepository } from '@nestjs/typeorm';
import { IsNull, Repository } from 'typeorm';
import {
  ACCESS_CODE_PERIOD_SECONDS,
  AccessKey,
  AccessKeyRotation,
  DateWindow,
  DeviceUserSync,
  Entitlement,
  EntitlementChangedEvent,
  EntitlementsRequest,
  MemberCreatedEvent,
  MemberStatus,
  MemberUpdatedEvent,
  PATTERNS,
  randomSecret,
  RotateAccessKeyRequest,
  RpcClient,
  SetCardRequest,
} from '@app/common';
import { toDeviceUser } from '../agents/device-sync';
import { AccessMember } from './access-member.entity';

interface MemberRow {
  memberId: string;
  memberCode: string;
  firstName: string;
  lastName: string;
  status: MemberStatus;
  /** Only entitlement updates carry windows; profile updates keep the stored ones. */
  windows?: DateWindow[];
}

export const RECONCILE_EVERY_MS = 10 * 60_000;

/**
 * A member deleted from membership-service stays as an anonymous, badge-less row: members.sync
 * keeps listing it as inactive so the agents disable it on the terminals (they only touch the
 * users they are sent). Finders skip these rows.
 */
const TOMBSTONE = `
  "removedAt" = now(),
  "firstName" = 'Membre',
  "lastName" = 'supprimé',
  "windows" = '[]'::jsonb,
  "cardNumber" = NULL,
  "lastQrStep" = NULL,
  "syncedAt" = now()`;

@Injectable()
export class AccessMembersService implements OnApplicationBootstrap {
  private readonly logger = new Logger(AccessMembersService.name);
  private reconciling = false;
  private membershipDownLogged = false;

  constructor(
    @InjectRepository(AccessMember) private readonly repo: Repository<AccessMember>,
    private readonly rpc: RpcClient,
  ) {}

  onApplicationBootstrap(): void {
    // Let the bus connect first; never block the boot on membership-service.
    setTimeout(() => void this.reconcile(), 3_000).unref();
  }

  findById(memberId?: string | null): Promise<AccessMember | null> {
    if (!memberId || typeof memberId !== 'string') return Promise.resolve(null);
    return this.repo.findOne({ where: { memberId, removedAt: IsNull() } });
  }

  findByCode(memberCode: string): Promise<AccessMember | null> {
    return this.repo.findOne({ where: { memberCode, removedAt: IsNull() } });
  }

  findByDeviceUid(deviceUid: number): Promise<AccessMember | null> {
    return this.repo.findOne({ where: { deviceUid, removedAt: IsNull() } });
  }

  // ---- read-model sync -------------------------------------------------------------------

  upsertProfile(event: MemberCreatedEvent | MemberUpdatedEvent): Promise<void> {
    return this.upsert({
      memberId: event.memberId,
      memberCode: event.memberCode,
      firstName: event.firstName,
      lastName: event.lastName,
      status: event.status,
    });
  }

  upsertEntitlement(entitlement: Entitlement | EntitlementChangedEvent, onlyIfSyncedBefore?: Date): Promise<void> {
    return this.upsert(
      {
        memberId: entitlement.memberId,
        memberCode: entitlement.memberCode,
        firstName: entitlement.firstName,
        lastName: entitlement.lastName,
        status: entitlement.status,
        windows: Array.isArray(entitlement.windows) ? entitlement.windows : [],
      },
      onlyIfSyncedBefore,
    );
  }

  /** member.deleted: the row becomes a tombstone (see TOMBSTONE). */
  async remove(memberId: string): Promise<void> {
    await this.repo.query(`UPDATE access_members SET ${TOMBSTONE} WHERE "memberId" = $1 AND "removedAt" IS NULL`, [
      memberId,
    ]);
  }

  /**
   * Insert-or-update keeping the door credentials (secret, badge, device uid, QR step).
   * With `onlyIfSyncedBefore` (reconciliation), rows written by an event after that instant are
   * left alone, and a member membership-service still lists is brought back from a tombstone;
   * an event never brings back a deleted member.
   */
  private async upsert(row: MemberRow, onlyIfSyncedBefore?: Date): Promise<void> {
    const params: unknown[] = [
      row.memberId,
      row.memberCode,
      row.firstName,
      row.lastName,
      row.status,
      JSON.stringify(row.windows ?? []),
      randomSecret(),
    ];
    let sql = `
      INSERT INTO access_members ("memberId", "memberCode", "firstName", "lastName", "status", "windows", "accessSecret", "syncedAt")
      VALUES ($1, $2, $3, $4, $5, $6::jsonb, $7, now())
      ON CONFLICT ("memberId") DO UPDATE SET
        "memberCode" = EXCLUDED."memberCode",
        "firstName" = EXCLUDED."firstName",
        "lastName" = EXCLUDED."lastName",
        "status" = EXCLUDED."status",
        ${row.windows !== undefined ? '"windows" = EXCLUDED."windows",' : ''}
        ${onlyIfSyncedBefore ? '"removedAt" = NULL,' : ''}
        "syncedAt" = now()`;
    if (onlyIfSyncedBefore) {
      params.push(onlyIfSyncedBefore);
      sql += ` WHERE access_members."syncedAt" < $8`;
    } else {
      sql += ` WHERE access_members."removedAt" IS NULL`;
    }
    await this.repo.query(sql, params);
  }

  /** Full resync from membership-service (on boot and every 10 min). Skipped when it is down. */
  @Interval(RECONCILE_EVERY_MS)
  async reconcile(): Promise<{ upserted: number; removed: number } | null> {
    if (this.reconciling) return null;
    this.reconciling = true;
    const startedAt = new Date();
    try {
      let entitlements: Entitlement[];
      try {
        entitlements = await this.rpc.send<Entitlement[], EntitlementsRequest>(PATTERNS.members.entitlements, {}, 15_000);
      } catch (err) {
        if (!this.membershipDownLogged) {
          this.logger.warn(`Reconciliation skipped, membership-service unavailable: ${(err as Error).message}`);
          this.membershipDownLogged = true;
        }
        return null;
      }
      this.membershipDownLogged = false;
      for (const entitlement of entitlements) {
        await this.upsertEntitlement(entitlement, startedAt);
      }
      const removed: [unknown[], number] | unknown[] = await this.repo.query(
        `UPDATE access_members SET ${TOMBSTONE}
         WHERE "removedAt" IS NULL AND "syncedAt" < $1 AND NOT ("memberId" = ANY($2::varchar[]))`,
        [startedAt, entitlements.map((e) => e.memberId)],
      );
      const removedCount = Array.isArray(removed) && typeof removed[1] === 'number' ? removed[1] : 0;
      this.logger.log(`Reconciled ${entitlements.length} members (${removedCount} removed)`);
      return { upserted: entitlements.length, removed: removedCount };
    } catch (err) {
      this.logger.error(`Reconciliation failed: ${(err as Error).message}`);
      return null;
    } finally {
      this.reconciling = false;
    }
  }

  // ---- credentials -----------------------------------------------------------------------

  async accessKey(memberId: string): Promise<AccessKey> {
    const member = await this.findById(memberId);
    if (!member) throw new NotFoundException('Accès pas encore configuré, réessayez dans un instant.');
    return toAccessKey(member.memberCode, member.accessSecret);
  }

  /**
   * New QR secret (lost or shared phone, security review finding 9): codes built with the old one
   * fail their signature from now on. The anti-replay step is reset so the new code works at once;
   * agents and terminals hold nothing derived from the secret (QR codes are checked here).
   */
  async rotateAccessKey(request: RotateAccessKeyRequest): Promise<AccessKeyRotation> {
    const member = await this.findById(request?.memberId);
    if (!member) throw new NotFoundException('Membre introuvable.');
    const secret = randomSecret();
    await this.repo.update({ memberId: member.memberId }, { accessSecret: secret, lastQrStep: null });
    const actor = request.actor;
    this.logger.log(
      `QR secret of member ${member.memberCode} rotated${actor ? ` by ${actor.role} ${actor.id}` : ''}`,
    );
    return { key: toAccessKey(member.memberCode, secret), rotatedAt: new Date().toISOString() };
  }

  /**
   * Atomically records the QR step; false when it was already used (replay or concurrent scan),
   * or when the secret the code was checked with has been rotated in the meantime.
   */
  async consumeQrStep(memberId: string, step: number, secret: string): Promise<boolean> {
    const result: [unknown[], number] = await this.repo.query(
      `UPDATE access_members SET "lastQrStep" = $2
       WHERE "memberId" = $1 AND "accessSecret" = $3 AND ("lastQrStep" IS NULL OR "lastQrStep" < $2)`,
      [memberId, step, secret],
    );
    return Array.isArray(result) && result[1] === 1;
  }

  async setCard(request: SetCardRequest): Promise<AccessMember> {
    const member = await this.findById(request.memberId);
    if (!member) throw new NotFoundException('Membre introuvable.');
    const cardNumber = typeof request.cardNumber === 'string' ? request.cardNumber.trim() || null : null;
    if (cardNumber !== null && !/^[0-9A-Za-z]{1,32}$/.test(cardNumber)) {
      throw new ConflictException('Numéro de badge invalide (chiffres et lettres uniquement).');
    }
    if (cardNumber !== null) {
      const owner = await this.repo.findOne({ where: { cardNumber } });
      if (owner && owner.memberId !== member.memberId) {
        throw new ConflictException('Ce badge est déjà attribué à un autre membre.');
      }
    }
    member.cardNumber = cardNumber;
    return this.repo.save(member);
  }

  /** Users the door agents enrol (active) or disable (inactive, without their badge) on ZKTeco terminals. */
  async deviceUsers(): Promise<DeviceUserSync[]> {
    const members = await this.repo.find({ order: { deviceUid: 'ASC' } });
    return members.map((member) => toDeviceUser(member));
  }

  allMemberIds(): Promise<string[]> {
    return this.repo
      .find({ select: { memberId: true }, where: { removedAt: IsNull() } })
      .then((rows) => rows.map((row) => row.memberId));
  }
}

function toAccessKey(memberCode: string, secret: string): AccessKey {
  return { memberCode, secret, period: ACCESS_CODE_PERIOD_SECONDS, format: 'MLR1.{memberCode}.{step}.{sig}' };
}
