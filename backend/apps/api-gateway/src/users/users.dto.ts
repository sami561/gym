import { IsBoolean, IsEmail, IsIn, IsOptional, IsString, IsUrl, Length, MaxLength, MinLength } from 'class-validator';
import { Role } from '@app/common';

const STAFF_ACCOUNT_ROLES = [Role.ADMIN, Role.STAFF, Role.COACH];

export class CreateUserDto {
  @IsEmail()
  email: string;

  @IsString()
  @MinLength(8)
  password: string;

  /** Members are created from the Membres page; this endpoint manages staff accounts. */
  @IsIn(STAFF_ACCOUNT_ROLES)
  role: Role;

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
  @IsString()
  @MaxLength(80)
  specialty?: string;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  bio?: string;

  @IsOptional()
  @IsUrl()
  avatarUrl?: string;
}

export class UpdateUserDto {
  @IsOptional()
  @IsEmail()
  email?: string;

  @IsOptional()
  @IsString()
  @MinLength(8)
  password?: string;

  @IsOptional()
  @IsIn(STAFF_ACCOUNT_ROLES)
  role?: Role;

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
  @IsString()
  @MaxLength(80)
  specialty?: string;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  bio?: string;

  @IsOptional()
  @IsUrl()
  avatarUrl?: string;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}

export class ListUsersQuery {
  @IsOptional()
  @IsIn(Object.values(Role))
  role?: Role;

  @IsOptional()
  @IsString()
  search?: string;
}
