import { Column, Entity, PrimaryColumn } from 'typeorm';

/** Monotonic counters (e.g. "sale-2026" → last receipt number of the year). */
@Entity('counters')
export class Counter {
  @PrimaryColumn({ type: 'varchar' })
  key: string;

  @Column({ type: 'int', default: 0 })
  value: number;
}
