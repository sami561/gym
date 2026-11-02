import { Type } from 'class-transformer';
import {
  IsDateString,
  IsEmail,
  IsEnum,
  IsOptional,
  IsString,
  IsUUID,
  Length,
  MaxLength,
  MinLength,
  ValidateNested,
} from 'class-validator';
import { LeadActivityType, LeadSource, LeadStatus } from '@app/common';
import { ToBoolean } from '../common/query';
import { PaymentInputDto } from '../members/members.dto';

export class CreateLeadDto {
  @IsString()
  @Length(1, 60)
  firstName: string;

  @IsString()
  @Length(1, 60)
  lastName: string;

  @IsOptional()
  @IsString()
  @Length(6, 30)
  phone?: string;

  @IsOptional()
  @IsEmail()
  email?: string;

  @IsEnum(LeadSource)
  source: LeadSource;

  @IsOptional()
  @IsUUID()
  interestPlanId?: string;

  @IsOptional()
  @IsDateString()
  trialDate?: string;

  @IsOptional()
  @IsDateString()
  followUpAt?: string;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  notes?: string;

  @IsOptional()
  @IsString()
  @MaxLength(80)
  assignedToName?: string;
}

export class UpdateLeadDto {
  @IsOptional()
  @IsString()
  @Length(1, 60)
  firstName?: string;

  @IsOptional()
  @IsString()
  @Length(1, 60)
  lastName?: string;

  @IsOptional()
  @IsString()
  @Length(6, 30)
  phone?: string;

  @IsOptional()
  @IsEmail()
  email?: string;

  @IsOptional()
  @IsEnum(LeadSource)
  source?: LeadSource;

  @IsOptional()
  @IsEnum(LeadStatus)
  status?: LeadStatus;

  @IsOptional()
  @IsUUID()
  interestPlanId?: string;

  @IsOptional()
  @IsDateString()
  trialDate?: string;

  @IsOptional()
  @IsDateString()
  followUpAt?: string;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  notes?: string;

  @IsOptional()
  @IsString()
  @MaxLength(80)
  assignedToName?: string;
}

export class ListLeadsQuery {
  @IsOptional()
  @IsEnum(LeadStatus)
  status?: LeadStatus;

  @IsOptional()
  @IsEnum(LeadSource)
  source?: LeadSource;

  @IsOptional()
  @IsString()
  search?: string;

  @IsOptional()
  @ToBoolean()
  dueOnly?: boolean;
}

export class LeadActivityDto {
  @IsEnum(LeadActivityType)
  type: LeadActivityType;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  note?: string;
}

export class ConvertLeadDto {
  @IsOptional()
  @IsString()
  @MinLength(8)
  password?: string;

  @IsOptional()
  @IsUUID()
  planId?: string;

  @IsOptional()
  @ValidateNested()
  @Type(() => PaymentInputDto)
  payment?: PaymentInputDto;
}
