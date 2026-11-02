import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { TicketPriority, TicketStatus, decimalTransformer } from '@app/common';
import { Equipment } from '../equipment/equipment.entity';
import { Room } from '../rooms/room.entity';

@Entity('maintenance_tickets')
@Index(['status', 'priority'])
export class MaintenanceTicket {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Index()
  @Column({ type: 'uuid', nullable: true })
  equipmentId: string | null;

  @ManyToOne(() => Equipment, { onDelete: 'SET NULL', nullable: true })
  @JoinColumn({ name: 'equipmentId' })
  equipment: Equipment | null;

  @Column({ type: 'uuid', nullable: true })
  roomId: string | null;

  @ManyToOne(() => Room, { onDelete: 'SET NULL', nullable: true })
  @JoinColumn({ name: 'roomId' })
  room: Room | null;

  @Column({ type: 'varchar', length: 160 })
  title: string;

  @Column({ type: 'text', nullable: true })
  description: string | null;

  @Column({ type: 'enum', enum: TicketPriority })
  priority: TicketPriority;

  @Column({ type: 'enum', enum: TicketStatus, default: TicketStatus.OPEN })
  status: TicketStatus;

  @Column({ type: 'varchar', length: 120, nullable: true })
  reportedByName: string | null;

  @Column({ type: 'varchar', length: 120, nullable: true })
  assignedTo: string | null;

  @Column({ type: 'numeric', precision: 12, scale: 3, nullable: true, transformer: decimalTransformer })
  cost: number | null;

  @Column({ type: 'text', nullable: true })
  resolution: string | null;

  @CreateDateColumn({ type: 'timestamptz' })
  openedAt: Date;

  @Column({ type: 'timestamptz', nullable: true })
  resolvedAt: Date | null;

  @UpdateDateColumn({ type: 'timestamptz' })
  updatedAt: Date;
}
