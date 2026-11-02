import { Column, CreateDateColumn, Entity, Index, JoinColumn, ManyToOne, PrimaryGeneratedColumn, Unique } from 'typeorm';
import { BookingStatus } from '@app/common';
import { ClassSession } from '../classes/class-session.entity';

@Entity('bookings')
@Unique(['sessionId', 'memberId'])
export class Booking {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'uuid' })
  sessionId: string;

  @ManyToOne(() => ClassSession, (session) => session.bookings, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'sessionId' })
  session: ClassSession;

  /** Member id (same id as the auth user). */
  @Index()
  @Column({ type: 'varchar' })
  memberId: string;

  /** Denormalised from membership-service, refreshed on member.updated. */
  @Column({ type: 'varchar' })
  memberName: string;

  @Column({ type: 'varchar', nullable: true })
  memberEmail: string | null;

  @Column({ type: 'enum', enum: BookingStatus, enumName: 'booking_status', default: BookingStatus.BOOKED })
  status: BookingStatus;

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt: Date;
}
