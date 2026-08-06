import { ApiProperty } from '@nestjs/swagger';
import { IsIn, IsInt, IsUUID, Max, Min } from 'class-validator';

import type { ClockTypeValue, TimeCategoryValue } from '../play.types';

export const TIME_CATEGORIES = ['CLASSICAL', 'RAPID', 'BLITZ', 'BULLET'] as const;

/**
 * MULTI_STAGE ATAYLAB YO'Q — docs/07-realtime-and-clock.md §3.2: u
 * TimeControlStage[] konfiguratsiyasini talab qiladi, OnlineGame jadvalida
 * esa faqat baseTimeSeconds + incrementSeconds bor (NOT_IMPLEMENTED).
 */
export const SUPPORTED_CLOCK_TYPES = [
  'SUDDEN_DEATH',
  'FISCHER_INCREMENT',
  'BRONSTEIN_DELAY',
  'SIMPLE_DELAY',
] as const;

/** Do'stona chaqiriq — muayyan raqibga qarshi (docs/14 Faza 5 "Do'st bilan o'yin"). */
export class CreateChallengeDto {
  @ApiProperty({ format: 'uuid', description: "Raqibning o'yinchi (Player) ID'si" })
  @IsUUID()
  opponentPlayerId!: string;

  @ApiProperty({ enum: TIME_CATEGORIES, example: 'BLITZ' })
  @IsIn(TIME_CATEGORIES)
  timeCategory!: TimeCategoryValue;

  @ApiProperty({ enum: SUPPORTED_CLOCK_TYPES, example: 'FISCHER_INCREMENT' })
  @IsIn(SUPPORTED_CLOCK_TYPES)
  clockType!: Exclude<ClockTypeValue, 'MULTI_STAGE'>;

  /**
   * Minimal baza 5s — "hyperbullet" oilasi (lichess'da 15s ultrabullet,
   * ba'zi platformalarda 5s ham o'ynaladi). Bu pastki chegara ayni paytda
   * flag-taymer integration testiga real (sun'iy soxtalanmagan) TIMEOUT
   * ssenariysini bir necha soniyada o'ynash imkonini beradi.
   */
  @ApiProperty({ minimum: 5, maximum: 21_600, example: 180 })
  @IsInt()
  @Min(5)
  @Max(21_600)
  baseTimeSeconds!: number;

  @ApiProperty({ minimum: 0, maximum: 180, example: 2 })
  @IsInt()
  @Min(0)
  @Max(180)
  incrementSeconds!: number;
}
