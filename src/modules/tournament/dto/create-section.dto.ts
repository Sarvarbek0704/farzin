import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';

import {
  CLOCK_TYPES,
  type ClockType,
  GENDERS,
  type Gender,
  PAIRING_SYSTEMS,
  type PairingSystem,
  PLAY_ENVIRONMENTS,
  type PlayEnvironment,
  TIE_BREAKS,
  TIME_CATEGORIES,
  type TimeCategory,
} from '../tournament.types';

/**
 * Seksiya yaratish — faqat DRAFT holatidagi turnirga (service tekshiradi).
 * Juftlashtirish va reyting SEKSIYA darajasida ishlaydi (schema izohi).
 */
export class CreateSectionDto {
  @ApiProperty({ example: 'A guruh' })
  @IsString()
  @MinLength(1)
  @MaxLength(100)
  name!: string;

  @ApiPropertyOptional({ enum: PAIRING_SYSTEMS, default: 'SWISS_DUTCH' })
  @IsOptional()
  @IsIn(PAIRING_SYSTEMS)
  pairingSystem?: PairingSystem;

  @ApiProperty({ enum: TIME_CATEGORIES })
  @IsIn(TIME_CATEGORIES)
  timeCategory!: TimeCategory;

  @ApiPropertyOptional({ enum: PLAY_ENVIRONMENTS, default: 'OTB' })
  @IsOptional()
  @IsIn(PLAY_ENVIRONMENTS)
  environment?: PlayEnvironment;

  @ApiProperty({ minimum: 1, example: 9 })
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(50)
  totalRounds!: number;

  @ApiProperty({ enum: CLOCK_TYPES })
  @IsIn(CLOCK_TYPES)
  clockType!: ClockType;

  @ApiProperty({ minimum: 1, example: 5400, description: "Boshlang'ich vaqt (sekundda)" })
  @Type(() => Number)
  @IsInt()
  @Min(1)
  baseTimeSeconds!: number;

  @ApiPropertyOptional({ minimum: 0, example: 30, description: 'Increment/delay (sekundda)' })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  incrementSeconds?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  minRating?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  maxRating?: number;

  @ApiPropertyOptional({ example: 2008, description: "Eng katta yosh chegarasi (tug'ilgan yil)" })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  minBirthYear?: number;

  @ApiPropertyOptional({ example: 2018 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  maxBirthYear?: number;

  @ApiPropertyOptional({ enum: GENDERS })
  @IsOptional()
  @IsIn(GENDERS)
  genderRestriction?: Gender;

  @ApiPropertyOptional({ minimum: 2, description: 'Ishtirokchilar limiti' })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(2)
  maxPlayers?: number;

  @ApiPropertyOptional({
    enum: TIE_BREAKS,
    isArray: true,
    description: "Tie-break tartibi — leksikografik qo'llaniladi (docs/05-pairing-engine.md §6)",
  })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(10)
  @IsIn(TIE_BREAKS, { each: true })
  tieBreakOrder?: string[];
}
