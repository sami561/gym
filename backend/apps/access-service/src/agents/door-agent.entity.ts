import { Column, CreateDateColumn, Entity, OneToMany, PrimaryGeneratedColumn } from 'typeorm';
import { Door } from '../doors/door.entity';

/** A door agent process running on the gym LAN (drives ZKTeco terminals / relays). */
@Entity('door_agents')
export class DoorAgent {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'varchar', length: 120 })
  name: string;

  /** SHA-256 of the API key; the plain key is returned once at creation. */
  @Column({ type: 'varchar', length: 64, unique: true })
  keyHash: string;

  @Column({ type: 'timestamptz', nullable: true })
  lastSeenAt: Date | null;

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt: Date;

  @OneToMany(() => Door, (door) => door.agent)
  doors: Door[];

  /** Filled by loadRelationCountAndMap in listings. */
  doorCount?: number;
}
