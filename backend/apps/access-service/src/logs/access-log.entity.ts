import { Column, Entity, Index, PrimaryGeneratedColumn } from 'typeorm';
import { AccessMethod, AccessResult, AppOpenContext } from '@app/common';

/**
 * Immutable history of every door attempt. Member and door names are copied at write
 * time so the log stays readable after a member or a door is deleted.
 */
@Entity('access_logs')
@Index(['memberId', 'createdAt'])
export class AccessLog {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'varchar', length: 64, nullable: true })
  memberId: string | null;

  @Column({ type: 'varchar', length: 200, nullable: true })
  memberName: string | null;

  @Column({ type: 'varchar', length: 32, nullable: true })
  memberCode: string | null;

  @Column({ type: 'uuid', nullable: true })
  doorId: string | null;

  @Column({ type: 'varchar', length: 120, nullable: true })
  doorName: string | null;

  @Column({ type: 'enum', enum: AccessMethod })
  method: AccessMethod;

  @Column({ type: 'enum', enum: AccessResult })
  result: AccessResult;

  @Column({ type: 'varchar', length: 300, nullable: true })
  reason: string | null;

  @Column({ type: 'varchar', length: 64, nullable: true })
  openedById: string | null;

  @Column({ type: 'varchar', length: 200, nullable: true })
  openedByName: string | null;

  /** App openings only: position, distance to the gym and client address, to investigate abuse. */
  @Column({ type: 'jsonb', nullable: true })
  context: AppOpenContext | null;

  /** "<doorId>:<deviceUserId>:<ISO time>" — de-duplicates punches re-sent by a ZKTeco agent. */
  @Index({ unique: true })
  @Column({ type: 'varchar', length: 200, nullable: true })
  deviceEventKey: string | null;

  @Index()
  @Column({ type: 'timestamptz', default: () => 'now()' })
  createdAt: Date;
}
