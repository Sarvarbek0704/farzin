import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsEmail, IsIn, IsOptional, IsString, MaxLength, MinLength } from 'class-validator';

/**
 * Ro'yxatdan o'tish.
 *
 * ⚠️  `role`, `rating`, `fideId` bu yerda YO'Q va HECH QACHON bo'lmaydi —
 *     mass assignment himoyasi (forbidNonWhitelisted + ongli DTO dizayni).
 *     docs/10-security.md §6
 *
 * Parol siyosati: TZ aniq belgilamagan (ochiq savol docs/10-security.md).
 * Qabul qilingan boshlang'ich: min 8 belgi, max 128 (DoS himoyasi —
 * Argon2 memory-hard, kilometrlik parol ham hisoblanadi).
 */
export class RegisterDto {
  @ApiProperty({ example: 'sarvar@example.uz' })
  @IsEmail()
  @MaxLength(320)
  email!: string;

  @ApiProperty({ minLength: 8, maxLength: 128, example: 'kuchli-parol-2026' })
  @IsString()
  @MinLength(8)
  @MaxLength(128)
  password!: string;

  @ApiProperty({ example: 'Sarvarbek' })
  @IsString()
  @MinLength(1)
  @MaxLength(100)
  firstName!: string;

  @ApiProperty({ example: 'Sodiqov' })
  @IsString()
  @MinLength(1)
  @MaxLength(100)
  lastName!: string;

  @ApiPropertyOptional({ enum: ['uz-Latn', 'uz-Cyrl', 'ru', 'en'], default: 'uz-Latn' })
  @IsOptional()
  @IsIn(['uz-Latn', 'uz-Cyrl', 'ru', 'en'])
  locale?: string;
}
