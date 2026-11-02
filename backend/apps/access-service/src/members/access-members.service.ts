import { ConflictException, Injectable, Logger, NotFoundException, OnApplicationBootstrap } from '@nestjs/common';
import { Interval } from '@nestjs/schedule';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import {
  ACCESS_CODE_PERIOD_SECONDS,
  AccessKey,
  DateWindow,
  DeviceUserSync,
  Entitlement,
  EntitlementChangedEvent,
  EntitlementsRequest,
  fullName,
  MemberCreatedEvent,
  MemberStatus,
  MemberUpdatedEvent,
  PATTERNS,
  randomSecret,
  RpcClient,
  SetCardRequest,
} from '@app/common';
import { checkMember } from '../access/access-decision';
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

/** ZKTeco terminals store at most 24 characters per user name. */
const DEVICE_NAME_MAX = 24;

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
    return this.repo.findOne({ where: { memberId } });
  }

  findByCode(memberCode: string): Promise<AccessMember | null> {
    return this.repo.findOne({ where: { memberCode } });
  }

  findByDeviceUid(deviceUid: number): Promise<AccessMember | null> {
    return this.repo.findOne({ where: { deviceUid } });
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

  async remove(memberId: string): Promise<void> {
    await this.repo.delete({ memberId });
  }

  /**
   * Insert-or-update keeping the door credentials (secret, badge, device uid, QR step).
   * With `onlyIfSyncedBefore`, rows written by an event after that instant are left alone.
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
        "syncedAt" = now()`;
    if (onlyIfSyncedBefore) {
      params.push(onlyIfSyncedBefore);
      sql += ` WHERE access_members."syncedAt" < $8`;
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
        `DELETE FROM access_members WHERE "syncedAt" < $1 AND NOT ("memberId" = ANY($2::varchar[]))`,
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
    return {
      memberCode: member.memberCode,
      secret: member.accessSecret,
      period: ACCESS_CODE_PERIOD_SECONDS,
      format: 'MLR1.{memberCode}.{step}.{sig}',
    };
  }

  /** Atomically records the QR step; false when it was already used (replay or concurrent scan). */
  async consumeQrStep(memberId: string, step: number): Promise<boolean> {
    const result: [unknown[], number] = await this.repo.query(
      `UPDATE access_members SET "lastQrStep" = $2
       WHERE "memberId" = $1 AND ("lastQrStep" IS NULL OR "lastQrStep" < $2)`,
      [memberId, step],
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

  /** Users the door agents enrol (active) or disable (inactive) on ZKTeco terminals. */
  async deviceUsers(): Promise<DeviceUserSync[]> {
    const members = await this.repo.find({ order: { deviceUid: 'ASC' } });
    return members.map((member) => ({
      deviceUid: member.deviceUid,
      name: fullName(member).slice(0, DEVICE_NAME_MAX),
      cardNumber: member.cardNumber,
      active: checkMember(member).ok,
    }));
  }

  allMemberIds(): Promise<string[]> {
    return this.repo.find({ select: { memberId: true } }).then((rows) => rows.map((row) => row.memberId));
  }
}
