import { IsDateString, IsEmail, IsOptional, IsString, IsUUID, Length, MaxLength } from 'class-validator';

export class ClassRangeQuery {
  @IsOptional()
  @IsDateString()
  from?: string;

  @IsOptional()
  @IsDateString()
  to?: string;
}

export class PublicTrialDto {
  @IsString()
  @Length(1, 60)
  firstName: string;

  @IsString()
  @Length(1, 60)
  lastName: string;

  @IsString()
  @Length(6, 30)
  phone: string;

  @IsOptional()
  @IsEmail({}, { message: 'Adresse e-mail invalide.' })
  email?: string;

  /** YYYY-MM-DD */
  @IsOptional()
  @IsDateString()
  trialDate?: string;

  @IsOptional()
  @IsUUID()
  interestPlanId?: string;

  @IsOptional()
  @IsString()
  @MaxLength(1000)
  message?: string;
}
