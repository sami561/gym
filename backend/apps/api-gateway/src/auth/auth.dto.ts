import { IsDateString, IsEmail, IsEnum, IsOptional, IsString, Length, MinLength } from 'class-validator';
import { Gender } from '@app/common';

export class LoginDto {
  @IsEmail({}, { message: 'Adresse e-mail invalide.' })
  email: string;

  @IsString()
  @MinLength(1)
  password: string;
}

export class RegisterDto {
  @IsString()
  @Length(1, 60)
  firstName: string;

  @IsString()
  @Length(1, 60)
  lastName: string;

  @IsEmail({}, { message: 'Adresse e-mail invalide.' })
  email: string;

  @IsString()
  @MinLength(8, { message: 'Le mot de passe doit contenir au moins 8 caractères.' })
  password: string;

  @IsOptional()
  @IsString()
  @Length(6, 30)
  phone?: string;

  /** YYYY-MM-DD */
  @IsOptional()
  @IsDateString()
  birthDate?: string;

  @IsOptional()
  @IsEnum(Gender)
  gender?: Gender;
}

export class RefreshDto {
  @IsString()
  refreshToken: string;
}

export class ChangePasswordDto {
  @IsString()
  currentPassword: string;

  @IsString()
  @MinLength(8, { message: 'Le mot de passe doit contenir au moins 8 caractères.' })
  newPassword: string;
}
