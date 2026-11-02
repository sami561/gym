import {
  Column,
  CreateDateColumn,
  Entity,
  JoinColumn,
  ManyToOne,
  OneToMany,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { LeadActivityType, LeadSource, LeadStatus } from '@app/common';

@Entity('leads')
export class Lead {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  firstName: string;

  @Column()
  lastName: string;

  @Column({ type: 'varchar', nullable: true })
  phone: string | null;

  @Column({ type: 'varchar', nullable: true })
  email: string | null;

  @Column({ type: 'enum', enum: LeadSource })
  source: LeadSource;

  @Column({ type: 'enum', enum: LeadStatus, default: LeadStatus.NEW })
  status: LeadStatus;

  @Column({ type: 'uuid', nullable: true })
  interestPlanId: string | null;

  @Column({ type: 'varchar', nullable: true })
  interestPlanName: string | null;

  @Column({ type: 'date', nullable: true })
  trialDate: string | null;

  @Column({ type: 'date', nullable: true })
  followUpAt: string | null;

  @Column({ type: 'text', nullable: true })
  notes: string | null;

  @Column({ type: 'varchar', nullable: true })
  assignedToName: string | null;

  @Column({ type: 'uuid', nullable: true })
  convertedMemberId: string | null;

  @Column({ type: 'timestamptz', nullable: true })
  closedAt: Date | null;

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn({ type: 'timestamptz' })
  updatedAt: Date;

  @OneToMany(() => LeadActivity, (a) => a.lead)
  activities: LeadActivity[];
}

@Entity('lead_activities')
export class LeadActivity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column('uuid')
  leadId: string;

  @ManyToOne(() => Lead, (l) => l.activities, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'leadId' })
  lead: Lead;

  @Column({ type: 'enum', enum: LeadActivityType })
  type: LeadActivityType;

  @Column({ type: 'text', nullable: true })
  note: string | null;

  @Column({ type: 'varchar', nullable: true })
  byName: string | null;

  @CreateDateColumn({ type: 'timestamptz' })
  at: Date;
}
