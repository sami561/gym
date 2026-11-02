import { Column, CreateDateColumn, Entity, Index, OneToMany, PrimaryColumn, UpdateDateColumn } from 'typeorm';
import { Gender, MemberStatus } from '@app/common';
import { Subscription } from '../subscriptions/subscription.entity';
import { Payment } from '../payments/payment.entity';

/** id is the auth-service user id: one identity across services. */
@Entity('members')
export class Member {
  @PrimaryColumn('uuid')
  id: string;

  @Index({ unique: true })
  @Column()
  memberCode: string;

  @Column()
  firstName: string;

  @Column()
  lastName: string;

  @Index()
  @Column()
  email: string;

  @Column({ type: 'varchar', nullable: true })
  phone: string | null;

  @Column({ type: 'date', nullable: true })
  birthDate: string | null;

  @Column({ type: 'enum', enum: Gender, nullable: true })
  gender: Gender | null;

  @Column({ type: 'varchar', nullable: true })
  emergencyContact: string | null;

  @Column({ type: 'text', nullable: true })
  notes: string | null;

  @Column({ type: 'enum', enum: MemberStatus, default: MemberStatus.ACTIVE })
  status: MemberStatus;

  @CreateDateColumn({ type: 'timestamptz' })
  joinedAt: Date;

  @UpdateDateColumn({ type: 'timestamptz' })
  updatedAt: Date;

  @OneToMany(() => Subscription, (s) => s.member)
  subscriptions: Subscription[];

  @OneToMany(() => Payment, (p) => p.member)
  payments: Payment[];
}
