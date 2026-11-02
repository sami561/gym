import { OmitType, PartialType } from '@nestjs/swagger';
import {
  IsDateString,
  IsEmail,
  IsEnum,
  IsIn,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  Length,
  Matches,
  Max,
  MaxLength,
  Min,
} from 'class-validator';
import {
  ContractType,
  EmployeePosition,
  EmployeeStatus,
  LeaveStatus,
  LeaveType,
  PaymentMethod,
  SalaryType,
} from '@app/common';
import { PERIOD_RE } from '../query';

export class ListEmployeesQuery {
  @IsOptional()
  @IsString()
  search?: string;

  @IsOptional()
  @IsEnum(EmployeePosition)
  position?: EmployeePosition;

  @IsOptional()
  @IsEnum(EmployeeStatus)
  status?: EmployeeStatus;
}

export class CreateEmployeeDto {
  /** Linked login (staff / coach account), if any. */
  @IsOptional()
  @IsUUID()
  userId?: string;

  @IsString()
  @Length(1, 60)
  firstName: string;

  @IsString()
  @Length(1, 60)
  lastName: string;

  @IsOptional()
  @IsEmail({}, { message: 'Adresse e-mail invalide.' })
  email?: string;

  @IsOptional()
  @IsString()
  @Length(6, 30)
  phone?: string;

  @IsEnum(EmployeePosition)
  position: EmployeePosition;

  @IsEnum(ContractType)
  contractType: ContractType;

  /** YYYY-MM-DD */
  @IsDateString()
  hireDate: string;

  @IsOptional()
  @IsDateString()
  endDate?: string;

  @IsEnum(SalaryType)
  salaryType: SalaryType;

  /** Monthly salary, hourly rate or rate per session (TND), depending on salaryType. */
  @IsNumber()
  @Min(0)
  baseSalary: number;

  /** Personal-training commission, 0-1. */
  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(1)
  commissionRate?: number;

  /** Tunisian national ID card number (8 digits). */
  @IsOptional()
  @Matches(/^\d{8}$/, { message: 'Le numéro de CIN doit contenir 8 chiffres.' })
  cin?: string;

  @IsOptional()
  @IsString()
  @MaxLength(30)
  cnssNumber?: string;

  @IsOptional()
  @IsString()
  @MaxLength(34)
  rib?: string;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  notes?: string;
}

export class UpdateEmployeeDto extends PartialType(CreateEmployeeDto) {
  @IsOptional()
  @IsEnum(EmployeeStatus)
  status?: EmployeeStatus;
}

export class ListShiftsQuery {
  @IsOptional()
  @IsDateString()
  from?: string;

  @IsOptional()
  @IsDateString()
  to?: string;

  @IsOptional()
  @IsUUID()
  employeeId?: string;
}

export class CreateShiftDto {
  @IsUUID()
  employeeId: string;

  @IsDateString()
  startsAt: string;

  @IsDateString()
  endsAt: string;

  /** "Accueil", "Ménage salle cardio"... */
  @IsOptional()
  @IsString()
  @MaxLength(120)
  task?: string;

  @IsOptional()
  @IsString()
  @MaxLength(80)
  roomName?: string;

  /** Also create the same shift on the following N weeks (0-12). */
  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(12)
  repeatWeeks?: number;
}

export class UpdateShiftDto extends PartialType(OmitType(CreateShiftDto, ['repeatWeeks'] as const)) {}

export class ClockDto {
  @IsUUID()
  employeeId: string;

  /** ISO date-time, for manual corrections; defaults to now. */
  @IsOptional()
  @IsDateString()
  at?: string;

  /** Defaults to MANUAL when `at` is given, KIOSK otherwise. */
  @IsOptional()
  @IsIn(['MANUAL', 'KIOSK'])
  source?: 'MANUAL' | 'KIOSK';
}

export class ListAttendanceQuery {
  @IsOptional()
  @IsDateString()
  from?: string;

  @IsOptional()
  @IsDateString()
  to?: string;

  @IsOptional()
  @IsUUID()
  employeeId?: string;
}

export class ListLeavesQuery {
  @IsOptional()
  @IsEnum(LeaveStatus)
  status?: LeaveStatus;

  @IsOptional()
  @IsUUID()
  employeeId?: string;
}

export class CreateLeaveDto {
  @IsUUID()
  employeeId: string;

  @IsEnum(LeaveType)
  type: LeaveType;

  /** YYYY-MM-DD, inclusive */
  @IsDateString()
  from: string;

  /** YYYY-MM-DD, inclusive */
  @IsDateString()
  to: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  reason?: string;
}

export class DecideLeaveDto {
  @IsIn([LeaveStatus.APPROVED, LeaveStatus.REJECTED])
  status: LeaveStatus.APPROVED | LeaveStatus.REJECTED;
}

export class ListPayrollQuery {
  /** YYYY-MM */
  @IsOptional()
  @Matches(PERIOD_RE, { message: 'Période invalide (AAAA-MM).' })
  period?: string;

  @IsOptional()
  @IsUUID()
  employeeId?: string;
}

export class GeneratePayrollDto {
  /** YYYY-MM, defaults to the previous month. */
  @IsOptional()
  @Matches(PERIOD_RE, { message: 'Période invalide (AAAA-MM).' })
  period?: string;
}

export class UpdatePayrollDto {
  @IsOptional()
  @IsNumber()
  @Min(0)
  bonuses?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  deductions?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  commissions?: number;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  notes?: string;
}

export class PayPayrollDto {
  @IsEnum(PaymentMethod)
  method: PaymentMethod;
}
