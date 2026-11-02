import { Column, CreateDateColumn, Entity, Index, JoinColumn, ManyToOne, PrimaryGeneratedColumn } from 'typeorm';
import { Employee } from '../employees/employee.entity';

export type AttendanceSource = 'MANUAL' | 'DEVICE' | 'KIOSK';

@Entity('attendance')
@Index(['employeeId', 'clockIn'])
// At most one open time-clock entry per employee, enforced by the database too.
@Index('uq_attendance_open', ['employeeId'], { unique: true, where: '"clockOut" IS NULL' })
export class Attendance {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'uuid' })
  employeeId: string;

  @ManyToOne(() => Employee, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'employeeId' })
  employee: Employee;

  @Column({ type: 'timestamptz' })
  clockIn: Date;

  @Column({ type: 'timestamptz', nullable: true })
  clockOut: Date | null;

  @Column({ type: 'int', nullable: true })
  minutes: number | null;

  @Column({ type: 'int', nullable: true })
  lateMinutes: number | null;

  @Column({ type: 'varchar', length: 10, default: 'MANUAL' })
  source: AttendanceSource;

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt: Date;
}
