import {
  Column,
  CreateDateColumn,
  Entity,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
  Unique,
  UpdateDateColumn,
} from 'typeorm';
import { PaymentMethod, PayrollStatus, decimalTransformer } from '@app/common';
import { Employee } from '../employees/employee.entity';

const money = { type: 'numeric' as const, precision: 12, scale: 3, default: 0, transformer: decimalTransformer };

@Entity('payrolls')
@Unique('uq_payroll_employee_period', ['employeeId', 'period'])
export class Payroll {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'uuid' })
  employeeId: string;

  @ManyToOne(() => Employee, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'employeeId' })
  employee: Employee;

  /** YYYY-MM */
  @Column({ type: 'varchar', length: 7 })
  period: string;

  @Column(money)
  baseAmount: number;

  @Column({ type: 'numeric', precision: 8, scale: 2, default: 0, transformer: decimalTransformer })
  hoursWorked: number;

  @Column({ type: 'int', default: 0 })
  sessions: number;

  @Column(money)
  commissions: number;

  @Column(money)
  bonuses: number;

  @Column(money)
  deductions: number;

  @Column(money)
  netAmount: number;

  @Column({ type: 'enum', enum: PayrollStatus, default: PayrollStatus.DRAFT })
  status: PayrollStatus;

  @Column({ type: 'timestamptz', nullable: true })
  paidAt: Date | null;

  @Column({ type: 'enum', enum: PaymentMethod, nullable: true })
  method: PaymentMethod | null;

  @Column({ type: 'text', nullable: true })
  notes: string | null;

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn({ type: 'timestamptz' })
  updatedAt: Date;
}
