import {
  IsBoolean,
  IsDateString,
  IsHexColor,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Length,
  Max,
  MaxLength,
  Min,
} from 'class-validator';
import { BookingStatus, STAFF_BOOKING_STATUSES } from '@app/common';

export class CreateClassDto {
  @IsString()
  @Length(1, 80)
  title: string;

  @IsOptional()
  @IsString()
  @MaxLength(1000)
  description?: string;

  @IsOptional()
  @IsUUID()
  coachId?: string;

  @IsOptional()
  @IsString()
  @MaxLength(80)
  room?: string;

  @IsOptional()
  @IsHexColor()
  color?: string;

  @IsDateString()
  startsAt: string;

  @IsDateString()
  endsAt: string;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(200)
  capacity?: number;

  @IsOptional()
  @IsBoolean()
  spotSelection?: boolean;

  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(100)
  waitlistCapacity?: number;

  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(12)
  repeatWeeks?: number;
}

export class UpdateClassDto {
  @IsOptional()
  @IsString()
  @Length(1, 80)
  title?: string;

  @IsOptional()
  @IsString()
  @MaxLength(1000)
  description?: string;

  @IsOptional()
  @IsUUID()
  coachId?: string;

  @IsOptional()
  @IsString()
  @MaxLength(80)
  room?: string;

  @IsOptional()
  @IsHexColor()
  color?: string;

  @IsOptional()
  @IsDateString()
  startsAt?: string;

  @IsOptional()
  @IsDateString()
  endsAt?: string;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(200)
  capacity?: number;

  @IsOptional()
  @IsBoolean()
  spotSelection?: boolean;

  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(100)
  waitlistCapacity?: number;
}

export class BookingStatusDto {
  /**
   * BOOKED, CANCELLED, ATTENDED or NO_SHOW (only once the class has started). WAITLISTED and
   * LATE_CANCELLED (a strike) come from the booking flow only.
   */
  @IsIn(STAFF_BOOKING_STATUSES, { message: 'Statut invalide (BOOKED, CANCELLED, ATTENDED ou NO_SHOW).' })
  status: BookingStatus;
}

/** Reception books a place on behalf of a member (phone / desk). */
export class StaffBookingDto {
  @IsUUID()
  memberId: string;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(200)
  spotNumber?: number;
}
