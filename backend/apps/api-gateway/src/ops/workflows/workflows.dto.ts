import { PartialType } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsBoolean,
  IsDateString,
  IsEnum,
  IsIn,
  IsInt,
  IsNumber,
  IsObject,
  IsOptional,
  IsString,
  IsUrl,
  IsUUID,
  Length,
  Max,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';
import { Role, TRIGGERABLE_EVENTS, TaskStatus, TaskType, WorkflowRunStatus, WorkflowTriggerType } from '@app/common';
import { QueryBoolean } from '../query';

export class ListWorkflowsQuery {
  @IsOptional()
  @QueryBoolean()
  activeOnly?: boolean;
}

export class WorkflowTriggerDto {
  @IsEnum(WorkflowTriggerType)
  type: WorkflowTriggerType;

  /** EVENT trigger: one of TRIGGERABLE_EVENTS (e.g. member.created). */
  @IsOptional()
  @IsIn([...TRIGGERABLE_EVENTS])
  event?: string | null;

  /** SCHEDULE trigger: 5-field cron in the gym timezone, e.g. "45 5 * * 1-6". */
  @IsOptional()
  @IsString()
  @MaxLength(100)
  cron?: string | null;
}

export class TaskAutomationDto {
  @IsIn(['WEBHOOK'])
  kind: 'WEBHOOK';

  @IsUrl({ require_protocol: true, protocols: ['http', 'https'], require_tld: false }, { message: 'URL invalide.' })
  url: string;

  @IsOptional()
  @IsIn(['POST', 'GET'])
  method?: 'POST' | 'GET';

  /** Extra JSON merged into the request body; {{placeholders}} come from the run context. */
  @IsOptional()
  @IsObject()
  body?: Record<string, unknown> | null;
}

export class NodePositionDto {
  @IsNumber()
  x: number;

  @IsNumber()
  y: number;
}

export class WorkflowTaskDefDto {
  /** Stable key chosen by the editor, referenced by dependsOn. */
  @IsString()
  @Length(1, 64)
  id: string;

  @IsString()
  @Length(1, 120)
  title: string;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  description?: string | null;

  @IsEnum(TaskType)
  type: TaskType;

  @IsOptional()
  @IsEnum(Role)
  assigneeRole?: Role | null;

  @IsOptional()
  @IsUUID()
  assigneeEmployeeId?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  assigneeName?: string | null;

  /** Due date = moment the task becomes TODO + dueInHours. */
  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(8760)
  dueInHours?: number | null;

  /** Ids of tasks of the same workflow that must be finished first. */
  @IsArray()
  @ArrayMaxSize(50)
  @IsString({ each: true })
  dependsOn: string[];

  @IsOptional()
  @ValidateNested()
  @Type(() => TaskAutomationDto)
  automation?: TaskAutomationDto | null;

  @IsOptional()
  @ValidateNested()
  @Type(() => NodePositionDto)
  position?: NodePositionDto | null;
}

export class CreateWorkflowDto {
  @IsString()
  @Length(1, 120)
  name: string;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  description?: string | null;

  /** Run title template, e.g. "Onboarding — {{firstName}} {{lastName}}". */
  @IsOptional()
  @IsString()
  @MaxLength(200)
  titleTemplate?: string | null;

  @ValidateNested()
  @Type(() => WorkflowTriggerDto)
  trigger: WorkflowTriggerDto;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;

  @IsArray()
  @ArrayMaxSize(100)
  @ValidateNested({ each: true })
  @Type(() => WorkflowTaskDefDto)
  tasks: WorkflowTaskDefDto[];
}

export class UpdateWorkflowDto extends PartialType(CreateWorkflowDto) {}

export class StartWorkflowDto {
  /** Values available to {{placeholders}}. */
  @IsOptional()
  @IsObject()
  context?: Record<string, unknown>;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  title?: string;
}

export class ListRunsQuery {
  @IsOptional()
  @IsUUID()
  workflowId?: string;

  @IsOptional()
  @IsEnum(WorkflowRunStatus)
  status?: WorkflowRunStatus;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(200)
  limit?: number;
}

export class ListTasksQuery {
  /** A TaskStatus, or OPEN = BLOCKED | TODO | IN_PROGRESS | FAILED. */
  @IsOptional()
  @IsIn([...Object.values(TaskStatus), 'OPEN'])
  status?: TaskStatus | 'OPEN';

  @IsOptional()
  @IsUUID()
  runId?: string;

  @IsOptional()
  @IsEnum(Role)
  assigneeRole?: Role;

  @IsOptional()
  @IsUUID()
  assigneeEmployeeId?: string;

  @IsOptional()
  @QueryBoolean()
  overdueOnly?: boolean;

  /** Only tasks for my role, assigned to me, or unassigned. */
  @IsOptional()
  @QueryBoolean()
  mine?: boolean;
}

export class CreateTaskDto {
  @IsString()
  @Length(1, 120)
  title: string;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  description?: string | null;

  @IsOptional()
  @IsEnum(Role)
  assigneeRole?: Role | null;

  @IsOptional()
  @IsUUID()
  assigneeEmployeeId?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  assigneeName?: string | null;

  @IsOptional()
  @IsDateString()
  dueAt?: string | null;

  /** Ids of tasks that must be finished before this one. */
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(50)
  @IsUUID('all', { each: true })
  dependsOn?: string[];
}

export class UpdateTaskDto extends PartialType(CreateTaskDto) {
  /** DONE / SKIPPED unblock the tasks that depend on this one. */
  @IsOptional()
  @IsEnum(TaskStatus)
  status?: TaskStatus;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  notes?: string | null;
}
