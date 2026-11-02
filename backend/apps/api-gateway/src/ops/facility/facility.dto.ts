import { PartialType } from '@nestjs/swagger';
import {
  IsBoolean,
  IsDateString,
  IsEnum,
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
  EquipmentCategory,
  EquipmentStatus,
  LockerStatus,
  RoomType,
  TicketPriority,
  TicketStatus,
} from '@app/common';

export class CreateRoomDto {
  @IsString()
  @Length(1, 80)
  name: string;

  @IsEnum(RoomType)
  type: RoomType;

  @IsInt()
  @Min(0)
  @Max(1000)
  capacity: number;

  @IsOptional()
  @IsString()
  @MaxLength(40)
  floor?: string;

  @IsOptional()
  @IsString()
  @MaxLength(1000)
  description?: string;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}

export class UpdateRoomDto extends PartialType(CreateRoomDto) {}

export class ListEquipmentQuery {
  @IsOptional()
  @IsUUID()
  roomId?: string;

  @IsOptional()
  @IsEnum(EquipmentStatus)
  status?: EquipmentStatus;

  @IsOptional()
  @IsEnum(EquipmentCategory)
  category?: EquipmentCategory;

  @IsOptional()
  @IsString()
  search?: string;

  /** Only equipment whose preventive maintenance is due within N days (or overdue). */
  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(365)
  dueWithinDays?: number;
}

export class CreateEquipmentDto {
  @IsString()
  @Length(1, 120)
  name: string;

  @IsEnum(EquipmentCategory)
  category: EquipmentCategory;

  @IsOptional()
  @IsString()
  @MaxLength(80)
  brand?: string;

  @IsOptional()
  @IsString()
  @MaxLength(80)
  model?: string;

  @IsOptional()
  @IsString()
  @MaxLength(80)
  serialNumber?: string;

  @IsOptional()
  @IsUUID()
  roomId?: string;

  @IsOptional()
  @IsDateString()
  purchaseDate?: string;

  @IsOptional()
  @IsNumber()
  @Min(0)
  purchasePrice?: number;

  @IsOptional()
  @IsDateString()
  warrantyUntil?: string;

  @IsOptional()
  @IsEnum(EquipmentStatus)
  status?: EquipmentStatus;

  /** Preventive maintenance interval in days. */
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(730)
  maintenanceIntervalDays?: number;

  @IsOptional()
  @IsDateString()
  lastMaintenanceAt?: string;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  notes?: string;
}

export class UpdateEquipmentDto extends PartialType(CreateEquipmentDto) {}

export class ListTicketsQuery {
  @IsOptional()
  @IsEnum(TicketStatus)
  status?: TicketStatus;

  @IsOptional()
  @IsUUID()
  equipmentId?: string;

  @IsOptional()
  @IsUUID()
  roomId?: string;
}

export class CreateTicketDto {
  @IsOptional()
  @IsUUID()
  equipmentId?: string;

  @IsOptional()
  @IsUUID()
  roomId?: string;

  @IsString()
  @Length(1, 120)
  title: string;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  description?: string;

  @IsEnum(TicketPriority)
  priority: TicketPriority;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  assignedTo?: string;

  /** Defaults to the name of the staff member creating the ticket. */
  @IsOptional()
  @IsString()
  @MaxLength(120)
  reportedByName?: string;
}

export class UpdateTicketDto {
  @IsOptional()
  @IsString()
  @Length(1, 120)
  title?: string;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  description?: string;

  @IsOptional()
  @IsEnum(TicketPriority)
  priority?: TicketPriority;

  @IsOptional()
  @IsEnum(TicketStatus)
  status?: TicketStatus;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  assignedTo?: string;

  /** Repair cost (TND); resolving a ticket with a cost records a MAINTENANCE expense. */
  @IsOptional()
  @IsNumber()
  @Min(0)
  cost?: number;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  resolution?: string;
}

export class ListLockersQuery {
  @IsOptional()
  @IsUUID()
  roomId?: string;

  @IsOptional()
  @IsEnum(LockerStatus)
  status?: LockerStatus;
}

export class CreateLockersDto {
  @IsOptional()
  @IsUUID()
  roomId?: string;

  /** Number prefix, e.g. "H-" gives H-1, H-2... */
  @IsOptional()
  @Matches(/^[A-Za-z0-9-]{0,6}$/, { message: 'Préfixe invalide (6 caractères max : lettres, chiffres, -).' })
  prefix?: string;

  @IsInt()
  @Min(1)
  @Max(9999)
  from: number;

  @IsInt()
  @Min(1)
  @Max(9999)
  to: number;
}

export class AssignLockerDto {
  /** Member to assign, or null / omitted to free the locker. */
  @IsOptional()
  @IsUUID()
  memberId?: string | null;

  /** Looked up from the member when omitted. */
  @IsOptional()
  @IsString()
  @MaxLength(120)
  memberName?: string;

  @IsOptional()
  @IsDateString()
  assignedUntil?: string;

  @IsOptional()
  @IsEnum(LockerStatus)
  status?: LockerStatus;
}
