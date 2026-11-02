import { Column, CreateDateColumn, Entity, Index, JoinColumn, ManyToOne, PrimaryGeneratedColumn } from 'typeorm';
import { LeaveStatus, LeaveType } from '@app/common';
import { Employee } from '../employees/employee.entity';

@Entity('leaves')
@Index(['employeeId', 'startDate'])
export class Leave {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'uuid' })
  employeeId: string;

  @ManyToOne(() => Employee, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'employeeId' })
  employee: Employee;

  @Column({ type: 'enum', enum: LeaveType })
  type: LeaveType;

  /** First day off (inclusive). Exposed as `from` in LeaveDto. */
  @Column({ type: 'date' })
  startDate: string;

  /** Last day off (inclusive). Exposed as `to` in LeaveDto. */
  @Column({ type: 'date' })
  endDate: string;

  @Column({ type: 'int' })
  days: number;

  @Column({ type: 'enum', enum: LeaveStatus, default: LeaveStatus.PENDING })
  status: LeaveStatus;

  @Column({ type: 'text', nullable: true })
  reason: string | null;

  @Column({ type: 'varchar', nullable: true })
  decidedByName: string | null;

  @Column({ type: 'timestamptz', nullable: true })
  decidedAt: Date | null;

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt: Date;
}
