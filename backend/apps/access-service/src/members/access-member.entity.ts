import { Column, Entity, Generated, Index, PrimaryColumn } from 'typeorm';
import { DateWindow, MemberStatus } from '@app/common';

const bigintToNumber = {
  to: (value?: number | null) => value,
  from: (value?: string | null) => (value === null || value === undefined ? null : Number(value)),
};

/**
 * Read-model of a member, fed by membership-service events (member.*, member.entitlement-changed)
 * and a periodic reconciliation, so doors keep opening even when membership-service is down.
 * Also owns the door credentials: QR access secret, RFID badge and ZKTeco user id. Deleted members
 * are kept as tombstones (removedAt) for the terminals.
 */
@Entity('access_members')
export class AccessMember {
  /** Same id as the auth user / membership member. */
  @PrimaryColumn({ type: 'varchar', length: 64 })
  memberId: string;

  @Index({ unique: true })
  @Column({ type: 'varchar', length: 32 })
  memberCode: string;

  @Column({ type: 'varchar', length: 100 })
  firstName: string;

  @Column({ type: 'varchar', length: 100 })
  lastName: string;

  @Column({ type: 'enum', enum: MemberStatus, default: MemberStatus.ACTIVE })
  status: MemberStatus;

  /** Paid periods (inclusive YYYY-MM-DD dates) during which the member may enter. */
  @Column({ type: 'jsonb', default: () => "'[]'" })
  windows: DateWindow[];

  /** HMAC key of the rotating QR code (see @app/common utils/access-code). */
  @Column({ type: 'varchar', length: 128 })
  accessSecret: string;

  /** RFID badge enrolled on the ZKTeco terminal. */
  @Index({ unique: true })
  @Column({ type: 'varchar', length: 64, nullable: true })
  cardNumber: string | null;

  /** User id (PIN) of the member on the ZKTeco terminal. */
  @Index({ unique: true })
  @Column({ type: 'int' })
  @Generated('increment')
  deviceUid: number;

  /** Last QR step accepted, to reject replays of a code already used. */
  @Column({ type: 'bigint', nullable: true, transformer: bigintToNumber })
  lastQrStep: number | null;

  /**
   * Set when the member was deleted from membership-service: the row stays, anonymous and
   * without badge, so the door agents keep disabling the member on the terminals.
   */
  @Column({ type: 'timestamptz', nullable: true })
  removedAt: Date | null;

  /** Last time this row was written from an event or a reconciliation. */
  @Column({ type: 'timestamptz', default: () => 'now()' })
  syncedAt: Date;

  @Column({ type: 'timestamptz', default: () => 'now()' })
  createdAt: Date;
}
