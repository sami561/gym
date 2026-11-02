import { Column, CreateDateColumn, Entity, Index, PrimaryGeneratedColumn, UpdateDateColumn } from 'typeorm';
import { ContractType, EmployeePosition, EmployeeStatus, SalaryType, decimalTransformer } from '@app/common';

@Entity('employees')
@Index('uq_employees_user', ['userId'], { unique: true, where: '"userId" IS NOT NULL' })
export class Employee {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  /** auth-service user id when the employee has a back-office login. */
  @Column({ type: 'varchar', nullable: true })
  userId: string | null;

  @Column({ type: 'varchar', length: 80 })
  firstName: string;

  @Column({ type: 'varchar', length: 80 })
  lastName: string;

  @Column({ type: 'varchar', nullable: true })
  email: string | null;

  @Column({ type: 'varchar', length: 30, nullable: true })
  phone: string | null;

  @Column({ type: 'enum', enum: EmployeePosition })
  position: EmployeePosition;

  @Column({ type: 'enum', enum: ContractType })
  contractType: ContractType;

  @Column({ type: 'date' })
  hireDate: string;

  @Column({ type: 'date', nullable: true })
  endDate: string | null;

  @Column({ type: 'enum', enum: SalaryType })
  salaryType: SalaryType;

  @Column({ type: 'numeric', precision: 10, scale: 3, transformer: decimalTransformer })
  baseSalary: number;

  @Column({ type: 'numeric', precision: 5, scale: 4, default: 0, transformer: decimalTransformer })
  commissionRate: number;

  @Column({ type: 'varchar', length: 20, nullable: true })
  cin: string | null;

  @Column({ type: 'varchar', length: 30, nullable: true })
  cnssNumber: string | null;

  @Column({ type: 'varchar', length: 40, nullable: true })
  rib: string | null;

  @Column({ type: 'enum', enum: EmployeeStatus, default: EmployeeStatus.ACTIVE })
  status: EmployeeStatus;

  @Column({ type: 'text', nullable: true })
  notes: string | null;

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn({ type: 'timestamptz' })
  updatedAt: Date;
}
