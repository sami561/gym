import {
  IsBoolean,
  IsEmail,
  IsIn,
  IsOptional,
  IsString,
  IsUrl,
  Length,
  MaxLength,
  MinLength,
  ValidateBy,
  ValidationOptions,
  buildMessage,
  isURL,
} from 'class-validator';
import { Role, coachPhotoOwner } from '@app/common';

const STAFF_ACCOUNT_ROLES = [Role.ADMIN, Role.STAFF, Role.COACH];

/**
 * A URL (as @IsUrl), or the coach photo URL the photo routes write (`/api/public/coaches/<id>/photo?v=…`): the
 * back-office may send back the avatarUrl it loaded. auth-service keeps the stored value in that case.
 */
function IsAvatarUrl(options?: ValidationOptions): PropertyDecorator {
  return ValidateBy(
    {
      name: 'isAvatarUrl',
      validator: {
        validate: (value: unknown) => typeof value === 'string' && (isURL(value) || coachPhotoOwner(value) !== null),
        defaultMessage: buildMessage((each) => `${each}$property must be a URL address`, options),
      },
    },
    options,
  );
}

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

  /** A URL typed by hand replaces the uploaded photo (deleted); null clears it. PUT/DELETE /users/:id/photo for files. */
  @IsOptional()
  @IsAvatarUrl()
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
