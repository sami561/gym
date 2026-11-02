import { Column, CreateDateColumn, Entity, Index, PrimaryGeneratedColumn, UpdateDateColumn } from 'typeorm';
import { ProgramDay } from '@app/common';

@Entity('workout_programs')
export class WorkoutProgram {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  /** Member id (same id as the auth user). */
  @Index()
  @Column({ type: 'varchar' })
  memberId: string;

  /** Denormalised from membership-service, refreshed on member.updated. */
  @Column({ type: 'varchar' })
  memberName: string;

  @Index()
  @Column({ type: 'varchar', nullable: true })
  coachId: string | null;

  /** Denormalised from auth-service, refreshed on user.updated. */
  @Column({ type: 'varchar', nullable: true })
  coachName: string | null;

  @Column({ type: 'varchar' })
  title: string;

  @Column({ type: 'text', nullable: true })
  goal: string | null;

  @Column({ type: 'date' })
  startDate: string;

  @Column({ type: 'int' })
  weeks: number;

  @Column({ type: 'jsonb', default: () => "'[]'" })
  days: ProgramDay[];

  @Column({ type: 'boolean', default: true })
  isActive: boolean;

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn({ type: 'timestamptz' })
  updatedAt: Date;
}
