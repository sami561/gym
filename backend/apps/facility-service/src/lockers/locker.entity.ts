import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { LockerStatus } from '@app/common';
import { Room } from '../rooms/room.entity';

@Entity('lockers')
export class Locker {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Index({ unique: true })
  @Column({ type: 'varchar', length: 20 })
  number: string;

  @Column({ type: 'uuid', nullable: true })
  roomId: string | null;

  @ManyToOne(() => Room, { onDelete: 'SET NULL', nullable: true })
  @JoinColumn({ name: 'roomId' })
  room: Room | null;

  @Column({ type: 'enum', enum: LockerStatus, default: LockerStatus.FREE })
  status: LockerStatus;

  /** membership-service member id (= auth user id). */
  @Index()
  @Column({ type: 'varchar', nullable: true })
  memberId: string | null;

  @Column({ type: 'varchar', length: 160, nullable: true })
  memberName: string | null;

  /** Last day of the rental (inclusive); released automatically afterwards. */
  @Column({ type: 'date', nullable: true })
  assignedUntil: string | null;

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn({ type: 'timestamptz' })
  updatedAt: Date;
}
