import { IsDateString, IsInt, IsOptional, Max, Min } from 'class-validator';

export class MonthsQuery {
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(36)
  months?: number;
}

export class DaysQuery {
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(365)
  days?: number;
}

export class DateQuery {
  /** YYYY-MM-DD */
  @IsOptional()
  @IsDateString()
  date?: string;
}

export class PeriodQuery {
  /** YYYY-MM-DD inclusive */
  @IsOptional()
  @IsDateString()
  from?: string;

  /** YYYY-MM-DD inclusive */
  @IsOptional()
  @IsDateString()
  to?: string;
}
