import { Column, CreateDateColumn, Entity, Index, OneToMany, PrimaryGeneratedColumn } from 'typeorm';
import { Booking } from '../bookings/booking.entity';

@Entity('class_sessions')
@Index(['startsAt'])
export class ClassSession {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'varchar', length: 120 })
  title: string;

  @Column({ type: 'text', nullable: true })
  description: string | null;

  /** auth-service user id of the coach. */
  @Index()
  @Column({ type: 'varchar', nullable: true })
  coachId: string | null;

  /** Denormalised from auth-service, refreshed on user.updated. */
  @Column({ type: 'varchar', nullable: true })
  coachName: string | null;

  @Column({ type: 'varchar', length: 80, nullable: true })
  room: string | null;

  @Column({ type: 'varchar', length: 16, nullable: true })
  color: string | null;

  @Column({ type: 'timestamptz' })
  startsAt: Date;

  @Column({ type: 'timestamptz' })
  endsAt: Date;

  @Column({ type: 'int', default: 20 })
  capacity: number;

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt: Date;

  @OneToMany(() => Booking, (booking) => booking.session)
  bookings: Booking[];
}
