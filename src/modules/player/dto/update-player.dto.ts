import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsBoolean,
  IsDate,
  IsIn,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  MinLength,
} from 'class-validator';

/**
 * O'z profilini tahrirlash.
 *
 * ⚠️  `rating`, `title`, `fideId` bu yerda YO'Q — ular foydalanuvchi
 *     tahriri emas: reyting — rating moduli, unvon — federatsiya,
 *     FIDE ID — alohida tasdiqlangan bog'lash oqimi.
 *     docs/10-security.md §6 (mass assignment)
 */
export class UpdatePlayerDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(100)
  firstName?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(100)
  lastName?: string;

  @ApiPropertyOptional({ nullable: true })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  middleName?: string;

  @ApiPropertyOptional({ nullable: true, description: 'Kirill yozuvidagi ism (rasmiy hujjatlar)' })
  @IsOptional()
  @IsString()
  @MaxLength(300)
  fullNameCyrl?: string;

  @ApiPropertyOptional({ type: Date })
  @IsOptional()
  @Type(() => Date)
  @IsDate()
  birthDate?: Date;

  @ApiPropertyOptional({ enum: ['MALE', 'FEMALE'] })
  @IsOptional()
  @IsIn(['MALE', 'FEMALE'])
  gender?: 'MALE' | 'FEMALE';

  @ApiPropertyOptional()
  @IsOptional()
  @IsUUID()
  regionId?: string;

  @ApiPropertyOptional({ description: 'Profil ochiqmi. Voyaga yetmaganlar uchun default yopiq.' })
  @IsOptional()
  @IsBoolean()
  isPublic?: boolean;
}
