import { Type } from 'class-transformer';
import {
  IsBoolean,
  IsDateString,
  IsEnum,
  IsInt,
  IsObject,
  IsOptional,
  IsString,
  IsUUID,
  Length,
  Max,
  MaxLength,
  Min,
} from 'class-validator';
import { AccessResult, DoorDriver } from '@app/common';

export class ListLogsQuery {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(500)
  limit?: number;

  @IsOptional()
  @IsUUID()
  doorId?: string;

  @IsOptional()
  @IsUUID()
  memberId?: string;

  @IsOptional()
  @IsEnum(AccessResult)
  result?: AccessResult;

  @IsOptional()
  @IsDateString()
  before?: string;
}

export class ScanDto {
  @IsString()
  @Length(10, 200)
  code: string;

  @IsUUID()
  doorId: string;
}

export class ManualOpenDto {
  @IsOptional()
  @IsString()
  @MaxLength(200)
  reason?: string;
}

export class CreateDoorDto {
  @IsString()
  @Length(1, 80)
  name: string;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  location?: string;

  @IsEnum(DoorDriver)
  driver: DoorDriver;

  @IsOptional()
  @IsObject()
  config?: Record<string, unknown>;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(60)
  unlockSeconds?: number;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;

  /** Members may open the door from the app (default true). */
  @IsOptional()
  @IsBoolean()
  allowAppOpen?: boolean;

  @IsOptional()
  @IsUUID()
  agentId?: string;
}

export class UpdateDoorDto {
  @IsOptional()
  @IsString()
  @Length(1, 80)
  name?: string;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  location?: string;

  @IsOptional()
  @IsEnum(DoorDriver)
  driver?: DoorDriver;

  @IsOptional()
  @IsObject()
  config?: Record<string, unknown>;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(60)
  unlockSeconds?: number;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;

  /** Members may open the door from the app (default true). */
  @IsOptional()
  @IsBoolean()
  allowAppOpen?: boolean;

  @IsOptional()
  @IsUUID()
  agentId?: string;
}

export class CreateAgentDto {
  @IsString()
  @Length(1, 80)
  name: string;
}
