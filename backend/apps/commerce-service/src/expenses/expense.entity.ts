import { Column, CreateDateColumn, Entity, Index, PrimaryGeneratedColumn, UpdateDateColumn } from 'typeorm';
import { ExpenseCategory, PaymentMethod, decimalTransformer } from '@app/common';

export type ExpenseSource = 'manual' | 'payroll' | 'maintenance';

@Entity('expenses')
export class Expense {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'enum', enum: ExpenseCategory, enumName: 'expense_category' })
  category: ExpenseCategory;

  @Column({ type: 'varchar' })
  label: string;

  @Column({ type: 'numeric', precision: 10, scale: 3, transformer: decimalTransformer })
  amount: number;

  /** YYYY-MM-DD */
  @Index()
  @Column({ type: 'date' })
  date: string;

  @Column({ type: 'enum', enum: PaymentMethod, enumName: 'expense_payment_method', nullable: true })
  paymentMethod: PaymentMethod | null;

  @Column({ type: 'varchar', nullable: true })
  supplier: string | null;

  @Column({ type: 'varchar', nullable: true })
  reference: string | null;

  @Column({ type: 'varchar', default: 'manual' })
  source: ExpenseSource;

  /** "payroll:<id>" / "maintenance:<id>" — makes automatic expenses idempotent. */
  @Column({ type: 'varchar', nullable: true, unique: true })
  sourceId: string | null;

  @Column({ type: 'varchar', nullable: true })
  createdById: string | null;

  @Column({ type: 'varchar', nullable: true })
  createdByName: string | null;

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn({ type: 'timestamptz' })
  updatedAt: Date;
}
