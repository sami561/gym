import { Column, CreateDateColumn, Entity, PrimaryGeneratedColumn, UpdateDateColumn } from 'typeorm';
import { WorkflowTaskDef, WorkflowTrigger } from '@app/common';

/** Reusable template: tasks linked by `dependsOn` (validated as a DAG). */
@Entity('workflows')
export class Workflow {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'varchar', length: 120 })
  name: string;

  @Column({ type: 'text', nullable: true })
  description: string | null;

  @Column({ type: 'varchar', length: 200, nullable: true })
  titleTemplate: string | null;

  @Column({ type: 'jsonb' })
  trigger: WorkflowTrigger;

  @Column({ type: 'jsonb', default: () => "'[]'" })
  tasks: WorkflowTaskDef[];

  @Column({ type: 'boolean', default: true })
  isActive: boolean;

  @Column({ type: 'int', default: 0 })
  runCount: number;

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn({ type: 'timestamptz' })
  updatedAt: Date;
}
