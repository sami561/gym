import { Column, CreateDateColumn, Entity, Index, JoinColumn, ManyToOne, PrimaryGeneratedColumn } from 'typeorm';
import { SubscriptionStatus, decimalTransformer } from '@app/common';
import { Member } from '../members/member.entity';
import { Plan } from '../plans/plan.entity';

@Entity('subscriptions')
@Index(['memberId', 'endDate'])
export class Subscription {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column('uuid')
  memberId: string;

  @ManyToOne(() => Member, (m) => m.subscriptions, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'memberId' })
  member: Member;

  @Column('uuid')
  planId: string;

  @ManyToOne(() => Plan, { eager: true })
  @JoinColumn({ name: 'planId' })
  plan: Plan;

  /** Inclusive, YYYY-MM-DD in the gym timezone. */
  @Column({ type: 'date' })
  startDate: string;

  /** Inclusive, YYYY-MM-DD in the gym timezone. */
  @Column({ type: 'date' })
  endDate: string;

  @Column({ type: 'enum', enum: SubscriptionStatus, default: SubscriptionStatus.ACTIVE })
  status: SubscriptionStatus;

  @Column({ type: 'numeric', precision: 10, scale: 3, transformer: decimalTransformer })
  price: number;

  @Column({ type: 'varchar', nullable: true })
  promoCode: string | null;

  @Column({ type: 'numeric', precision: 10, scale: 3, default: 0, transformer: decimalTransformer })
  discount: number;

  @Column({ type: 'date', nullable: true })
  frozenAt: string | null;

  @Column({ type: 'int', nullable: true })
  frozenDays: number | null;

  @Column({ type: 'varchar', nullable: true })
  freezeReason: string | null;

  /** Set once subscription.expiring was published, so the reminder goes out once. */
  @Column({ type: 'timestamptz', nullable: true })
  reminderSentAt: Date | null;

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt: Date;
}
