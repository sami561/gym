import { Column, CreateDateColumn, Entity, Index, JoinColumn, ManyToOne, PrimaryGeneratedColumn } from 'typeorm';
import { PaymentMethod, decimalTransformer } from '@app/common';
import { Member } from '../members/member.entity';
import { Subscription } from '../subscriptions/subscription.entity';

@Entity('payments')
export class Payment {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column('uuid')
  memberId: string;

  @ManyToOne(() => Member, (m) => m.payments, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'memberId' })
  member: Member;

  @Column({ type: 'uuid', nullable: true })
  subscriptionId: string | null;

  @ManyToOne(() => Subscription, { onDelete: 'SET NULL', nullable: true })
  @JoinColumn({ name: 'subscriptionId' })
  subscription: Subscription | null;

  @Column({ type: 'numeric', precision: 10, scale: 3, transformer: decimalTransformer })
  amount: number;

  @Column({ type: 'enum', enum: PaymentMethod })
  method: PaymentMethod;

  @Column({ type: 'varchar', nullable: true })
  reference: string | null;

  @Index()
  @Column({ type: 'timestamptz' })
  paidAt: Date;

  @Column({ type: 'uuid', nullable: true })
  receivedById: string | null;

  @Column({ type: 'varchar', nullable: true })
  receivedByName: string | null;

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt: Date;
}
