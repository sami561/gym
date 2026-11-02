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
import { EquipmentCategory, EquipmentStatus, decimalTransformer } from '@app/common';
import { Room } from '../rooms/room.entity';

@Entity('equipment')
@Index('uq_equipment_serial', ['serialNumber'], { unique: true, where: '"serialNumber" IS NOT NULL' })
export class Equipment {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'varchar', length: 120 })
  name: string;

  @Column({ type: 'enum', enum: EquipmentCategory })
  category: EquipmentCategory;

  @Column({ type: 'varchar', length: 80, nullable: true })
  brand: string | null;

  @Column({ type: 'varchar', length: 80, nullable: true })
  model: string | null;

  @Column({ type: 'varchar', length: 80, nullable: true })
  serialNumber: string | null;

  @Index()
  @Column({ type: 'uuid', nullable: true })
  roomId: string | null;

  @ManyToOne(() => Room, { onDelete: 'SET NULL', nullable: true })
  @JoinColumn({ name: 'roomId' })
  room: Room | null;

  @Column({ type: 'date', nullable: true })
  purchaseDate: string | null;

  @Column({ type: 'numeric', precision: 12, scale: 3, nullable: true, transformer: decimalTransformer })
  purchasePrice: number | null;

  @Column({ type: 'date', nullable: true })
  warrantyUntil: string | null;

  @Column({ type: 'enum', enum: EquipmentStatus, default: EquipmentStatus.OPERATIONAL })
  status: EquipmentStatus;

  @Column({ type: 'int', nullable: true })
  maintenanceIntervalDays: number | null;

  @Column({ type: 'date', nullable: true })
  lastMaintenanceAt: string | null;

  @Column({ type: 'text', nullable: true })
  notes: string | null;

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn({ type: 'timestamptz' })
  updatedAt: Date;
}
