import { Column, Entity, Index, OneToMany, PrimaryGeneratedColumn } from 'typeorm';
import { WorkflowRunStatus } from '@app/common';
import { Task } from '../tasks/task.entity';

/** One execution of a workflow. Keeps the workflow name so history survives a deleted template. */
@Entity('workflow_runs')
@Index(['status'])
@Index(['workflowId'])
export class WorkflowRun {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'uuid' })
  workflowId: string;

  @Column({ type: 'varchar', length: 120 })
  workflowName: string;

  @Column({ type: 'varchar', length: 200 })
  title: string;

  @Column({ type: 'enum', enum: WorkflowRunStatus, default: WorkflowRunStatus.RUNNING })
  status: WorkflowRunStatus;

  /** Values for {{placeholders}}: the event payload for EVENT triggers. */
  @Column({ type: 'jsonb', default: () => "'{}'" })
  context: Record<string, unknown>;

  @Column({ type: 'varchar', length: 120, nullable: true })
  startedByName: string | null;

  @Column({ type: 'timestamptz' })
  startedAt: Date;

  @Column({ type: 'timestamptz', nullable: true })
  completedAt: Date | null;

  @OneToMany(() => Task, (task) => task.run)
  tasks: Task[];
}
