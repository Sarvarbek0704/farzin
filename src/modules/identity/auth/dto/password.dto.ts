import { ApiProperty } from '@nestjs/swagger';
import { IsEmail, IsString, MaxLength, MinLength } from 'class-validator';

/**
 * Parol oqimlari DTO'lari — docs/10-security.md §7.1 jadvali:
 *   POST /auth/password/forgot  → 3/soat, kalit IP + email
 *   POST /auth/password/reset   → 5/soat, kalit IP
 *
 * Parol siyosati register.dto.ts bilan AYNAN bir xil (min 8, max 128):
 * ikki joyda turli qoida bo'lsa, foydalanuvchi ro'yxatdan o'ta oladigan
 * parolni tiklashda rad etilardi.
 */

export class ForgotPasswordDto {
  @ApiProperty({ example: 'sarvar@example.uz' })
  @IsEmail()
  @MaxLength(320)
  email!: string;
}

export class ResetPasswordDto {
  @ApiProperty({ description: 'Email havolasidagi bir martalik token' })
  @IsString()
  @MinLength(1)
  @MaxLength(512)
  token!: string;

  @ApiProperty({ minLength: 8, maxLength: 128 })
  @IsString()
  @MinLength(8)
  @MaxLength(128)
  newPassword!: string;
}

export class ChangePasswordDto {
  @ApiProperty({ description: 'Joriy parol — egalikni tasdiqlaydi' })
  @IsString()
  @MinLength(1)
  @MaxLength(128)
  currentPassword!: string;

  @ApiProperty({ minLength: 8, maxLength: 128 })
  @IsString()
  @MinLength(8)
  @MaxLength(128)
  newPassword!: string;
}
