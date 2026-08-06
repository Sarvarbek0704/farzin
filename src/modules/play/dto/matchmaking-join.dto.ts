import { ApiProperty } from '@nestjs/swagger';
import { IsIn, IsInt, Max, Min } from 'class-validator';

import type { ClockTypeValue, TimeCategoryValue } from '../play.types';
import { SUPPORTED_CLOCK_TYPES, TIME_CATEGORIES } from './create-challenge.dto';

/**
 * Matchmaking navbatiga qo'shilish — chelak (docs/07 §9.3):
 * (timeCategory, clockType, base, inc) to'rtligi.
 */
export class MatchmakingJoinDto {
  @ApiProperty({ enum: TIME_CATEGORIES, example: 'BLITZ' })
  @IsIn(TIME_CATEGORIES)
  timeCategory!: TimeCategoryValue;

  @ApiProperty({ enum: SUPPORTED_CLOCK_TYPES, example: 'FISCHER_INCREMENT' })
  @IsIn(SUPPORTED_CLOCK_TYPES)
  clockType!: Exclude<ClockTypeValue, 'MULTI_STAGE'>;

  @ApiProperty({ minimum: 15, maximum: 21_600, example: 180 })
  @IsInt()
  @Min(15)
  @Max(21_600)
  baseTimeSeconds!: number;

  @ApiProperty({ minimum: 0, maximum: 180, example: 2 })
  @IsInt()
  @Min(0)
  @Max(180)
  incrementSeconds!: number;
}
