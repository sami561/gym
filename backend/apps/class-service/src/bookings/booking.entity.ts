import { Column, CreateDateColumn, Entity, Index, JoinColumn, ManyToOne, PrimaryGeneratedColumn, Unique } from 'typeorm';
import { BookingStatus } from '@app/common';
import { ClassSession } from '../classes/class-session.entity';

@Entity('bookings')
@Unique(['sessionId', 'memberId'])
// A numbered place can only be held by one BOOKED/ATTENDED booking of the session.
@Index('UQ_bookings_session_spot', ['sessionId', 'spotNumber'], {
  unique: true,
  where: `"status" IN ('BOOKED', 'ATTENDED') AND "spotNumber" IS NOT NULL`,
})
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

  @Index()
  @Column({ type: 'enum', enum: BookingStatus, enumName: 'booking_status', default: BookingStatus.BOOKED })
  status: BookingStatus;

  /** Held place when BOOKED/ATTENDED, wished place while WAITLISTED. */
  @Column({ type: 'int', nullable: true })
  spotNumber: number | null;

  /** When the booking joined the waitlist (FIFO order). */
  @Column({ type: 'timestamptz', nullable: true })
  queuedAt: Date | null;

  @Column({ type: 'timestamptz', nullable: true })
  checkedInAt: Date | null;

  @Column({ type: 'timestamptz', nullable: true })
  reminderSentAt: Date | null;

  /** Set while the booking is a strike (NO_SHOW / LATE_CANCELLED). */
  @Column({ type: 'timestamptz', nullable: true })
  strikeAt: Date | null;

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt: Date;
}
