import { Column, CreateDateColumn, Entity, JoinColumn, ManyToOne, PrimaryGeneratedColumn, UpdateDateColumn } from 'typeorm';
import { DoorDriver } from '@app/common';
import { DoorAgent } from '../agents/door-agent.entity';

@Entity('doors')
export class Door {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'varchar', length: 120 })
  name: string;

  @Column({ type: 'varchar', length: 200, nullable: true })
  location: string | null;

  @Column({ type: 'enum', enum: DoorDriver, default: DoorDriver.SIMULATOR })
  driver: DoorDriver;

  /**
   * ZKTECO: { ip, port?, timeoutMs? } · HTTP_RELAY: { url, method?, headers?, basicAuth?, body?, timeoutMs? } ·
   * SIMULATOR: {}. Holds secrets: only agents get it as is (doors/door-secrets.ts masks it for the back-office).
   */
  @Column({ type: 'jsonb', default: () => "'{}'" })
  config: Record<string, unknown>;

  @Column({ type: 'int', default: 5 })
  unlockSeconds: number;

  @Column({ type: 'boolean', default: true })
  isActive: boolean;

  /** Members may open it with the app button (false for back doors, staff rooms...). */
  @Column({ type: 'boolean', default: true })
  allowAppOpen: boolean;

  @Column({ type: 'uuid', nullable: true })
  agentId: string | null;

  @ManyToOne(() => DoorAgent, (agent) => agent.doors, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'agentId' })
  agent: DoorAgent | null;

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn({ type: 'timestamptz' })
  updatedAt: Date;
}
