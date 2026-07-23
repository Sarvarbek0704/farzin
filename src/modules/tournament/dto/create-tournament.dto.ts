import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsBoolean,
  IsDate,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';

/**
 * Turnir yaratish.
 *
 * ⚠️  `organizerId` va `status` bu yerda YO'Q — tashkilotchi HAR DOIM
 *     aktorning o'zi, holat DRAFT'dan boshlanadi. Mass assignment
 *     himoyasi — docs/10-security.md §6.
 */
export class CreateTournamentDto {
  @ApiProperty({ example: 'Toshkent ochiq chempionati 2026' })
  @IsString()
  @MinLength(3)
  @MaxLength(200)
  name!: string;

  @ApiProperty({ example: 'toshkent-open-2026', description: 'URL uchun unikal' })
  @IsString()
  @MinLength(2)
  @MaxLength(100)
  @Matches(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, { message: 'slug: kichik harf, raqam va defis' })
  slug!: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(5000)
  description?: string;

  @ApiPropertyOptional({ description: 'Turnir klub nomidan — ierarxiya klubdan hal qilinadi' })
  @IsOptional()
  @IsUUID()
  clubId?: string;

  @ApiPropertyOptional({ description: 'Turnir viloyat nomidan' })
  @IsOptional()
  @IsUUID()
  regionId?: string;

  @ApiPropertyOptional({ description: 'Turnir federatsiya nomidan' })
  @IsOptional()
  @IsUUID()
  federationId?: string;

  @ApiPropertyOptional({ example: 'Yoshlar ijod saroyi' })
  @IsOptional()
  @IsString()
  @MaxLength(200)
  venueName?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(500)
  address?: string;

  @ApiProperty({ type: Date })
  @Type(() => Date)
  @IsDate()
  startDate!: Date;

  @ApiProperty({ type: Date })
  @Type(() => Date)
  @IsDate()
  endDate!: Date;

  @ApiPropertyOptional({ type: Date })
  @IsOptional()
  @Type(() => Date)
  @IsDate()
  registrationOpensAt?: Date;

  @ApiPropertyOptional({ type: Date })
  @IsOptional()
  @Type(() => Date)
  @IsDate()
  registrationClosesAt?: Date;

  @ApiPropertyOptional({ description: "Start puli — TIYINDA (ADR-0006). Yo'q = bepul." })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  entryFeeAmount?: number;

  @ApiPropertyOptional({ description: 'FIDE reytingiga hisoblanadimi' })
  @IsOptional()
  @IsBoolean()
  isFideRated?: boolean;

  @ApiPropertyOptional({ description: 'Farzin milliy reytingiga hisoblanadimi' })
  @IsOptional()
  @IsBoolean()
  isNationallyRated?: boolean;

  @ApiPropertyOptional({ description: "Ommaviy kalendarda ko'rinadimi" })
  @IsOptional()
  @IsBoolean()
  isPublic?: boolean;
}
