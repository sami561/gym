import { Column, CreateDateColumn, Entity, Index, PrimaryGeneratedColumn } from 'typeorm';
import { decimalTransformer } from '@app/common';

const metric = { type: 'numeric' as const, precision: 6, scale: 2, nullable: true, transformer: decimalTransformer };

@Entity('measurements')
@Index(['memberId', 'date'])
export class Measurement {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'varchar' })
  memberId: string;

  /** YYYY-MM-DD */
  @Column({ type: 'date' })
  date: string;

  @Column(metric)
  weightKg: number | null;

  @Column(metric)
  heightCm: number | null;

  @Column(metric)
  bodyFatPct: number | null;

  @Column(metric)
  musclePct: number | null;

  @Column(metric)
  chestCm: number | null;

  @Column(metric)
  waistCm: number | null;

  @Column(metric)
  hipsCm: number | null;

  @Column(metric)
  armCm: number | null;

  @Column(metric)
  thighCm: number | null;

  @Column({ type: 'text', nullable: true })
  notes: string | null;

  @Column({ type: 'varchar', nullable: true })
  recordedByName: string | null;

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt: Date;
}
