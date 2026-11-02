import { Column, CreateDateColumn, Entity, Index, PrimaryGeneratedColumn, UpdateDateColumn } from 'typeorm';
import { PtSessionStatus, decimalTransformer } from '@app/common';

@Entity('pt_sessions')
@Index(['coachId', 'startsAt'])
export class PtSession {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'varchar' })
  coachId: string;

  @Column({ type: 'varchar' })
  coachName: string;

  @Index()
  @Column({ type: 'varchar' })
  memberId: string;

  @Column({ type: 'varchar' })
  memberName: string;

  @Index()
  @Column({ type: 'timestamptz' })
  startsAt: Date;

  @Column({ type: 'timestamptz' })
  endsAt: Date;

  @Column({ type: 'enum', enum: PtSessionStatus, enumName: 'pt_session_status', default: PtSessionStatus.SCHEDULED })
  status: PtSessionStatus;

  @Column({ type: 'numeric', precision: 10, scale: 3, transformer: decimalTransformer })
  price: number;

  @Column({ type: 'text', nullable: true })
  notes: string | null;

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn({ type: 'timestamptz' })
  updatedAt: Date;
}
