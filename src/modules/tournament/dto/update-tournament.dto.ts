import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsBoolean,
  IsDate,
  IsInt,
  IsOptional,
  IsString,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';

/**
 * Turnirni tahrirlash — faqat DRAFT/REGISTRATION_OPEN holatida
 * (service qatlami tekshiradi).
 *
 * ⚠️  `slug`, `status`, `organizerId`, org identifikatorlari bu yerda
 *     YO'Q: slug — barqaror URL, holat — faqat status mashinasi orqali,
 *     ierarxiya yaratilganda muhrlanadi. docs/10-security.md §6
 */
export class UpdateTournamentDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MinLength(3)
  @MaxLength(200)
  name?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(5000)
  description?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(200)
  venueName?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(500)
  address?: string;

  @ApiPropertyOptional({ type: Date })
  @IsOptional()
  @Type(() => Date)
  @IsDate()
  startDate?: Date;

  @ApiPropertyOptional({ type: Date })
  @IsOptional()
  @Type(() => Date)
  @IsDate()
  endDate?: Date;

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

  @ApiPropertyOptional({ description: 'Start puli — TIYINDA (ADR-0006)' })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  entryFeeAmount?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  isFideRated?: boolean;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  isNationallyRated?: boolean;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  isPublic?: boolean;
}
