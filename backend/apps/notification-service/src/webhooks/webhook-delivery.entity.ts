import { Column, CreateDateColumn, Entity, Index, PrimaryGeneratedColumn } from 'typeorm';

export enum DeliveryStatus {
  PENDING = 'PENDING',
  DELIVERED = 'DELIVERED',
  FAILED = 'FAILED',
  SKIPPED = 'SKIPPED',
}

/** Outbox of events forwarded to n8n; the row id is the delivery id sent to n8n. */
@Entity('webhook_deliveries')
@Index(['status', 'nextAttemptAt'])
export class WebhookDelivery {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Index()
  @Column({ type: 'varchar', length: 64 })
  event: string;

  @Column({ type: 'jsonb' })
  payload: Record<string, unknown>;

  @Column({ type: 'enum', enum: DeliveryStatus, enumName: 'webhook_delivery_status', default: DeliveryStatus.PENDING })
  status: DeliveryStatus;

  @Column({ type: 'int', default: 0 })
  attempts: number;

  /** When the next attempt is due; also used as a short lease while an attempt is running. */
  @Column({ type: 'timestamptz', nullable: true })
  nextAttemptAt: Date | null;

  @Column({ type: 'text', nullable: true })
  lastError: string | null;

  @Column({ type: 'timestamptz', nullable: true })
  deliveredAt: Date | null;

  /** Sent as `occurredAt` in the webhook body. */
  @CreateDateColumn({ type: 'timestamptz' })
  createdAt: Date;
}
