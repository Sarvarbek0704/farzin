import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsEmail, IsOptional, IsString, MaxLength, MinLength } from 'class-validator';

export class LoginDto {
  @ApiProperty({ example: 'sarvar@example.uz' })
  @IsEmail()
  @MaxLength(320)
  email!: string;

  @ApiProperty()
  @IsString()
  @MinLength(1)
  @MaxLength(128)
  password!: string;

  /**
   * 2FA yoqilgan hisob uchun: 6 raqamli TOTP kod yoki 10 belgili zaxira kod.
   * Berilmasa va 2FA yoqiq bo'lsa — 401 TOTP_REQUIRED qaytadi.
   */
  @ApiPropertyOptional({ example: '123456' })
  @IsOptional()
  @IsString()
  @MinLength(6)
  @MaxLength(20)
  totpCode?: string;
}
