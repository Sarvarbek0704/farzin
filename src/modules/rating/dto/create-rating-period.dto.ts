import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsDate, IsIn, IsNumber, IsOptional, Max, Min } from 'class-validator';

import {
  PLAY_ENVIRONMENTS,
  type PlayEnvironment,
  TAU_DEFAULT,
  TAU_MAX,
  TAU_MIN,
  TIME_CATEGORIES,
  type TimeCategory,
} from '../rating.types';

/**
 * Rating davri yaratish. OTB+BULLET kombinatsiyasi service qatlamida rad
 * etiladi (docs/06-rating-system.md §5.1). Kesishuvchi davr → 409.
 */
export class CreateRatingPeriodDto {
  @ApiProperty({ enum: PLAY_ENVIRONMENTS })
  @IsIn(PLAY_ENVIRONMENTS)
  environment!: PlayEnvironment;

  @ApiProperty({ enum: TIME_CATEGORIES })
  @IsIn(TIME_CATEGORIES)
  timeCategory!: TimeCategory;

  @ApiProperty({ type: Date, description: 'Davr boshi (inklyuziv)' })
  @Type(() => Date)
  @IsDate()
  startsAt!: Date;

  @ApiProperty({ type: Date, description: 'Davr oxiri (eksklyuziv)' })
  @Type(() => Date)
  @IsDate()
  endsAt!: Date;

  @ApiPropertyOptional({
    minimum: TAU_MIN,
    maximum: TAU_MAX,
    default: TAU_DEFAULT,
    description: 'Glicko-2 sistema konstantasi τ (docs/06 §2.13) — davrda muzlatiladi',
  })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(TAU_MIN)
  @Max(TAU_MAX)
  tau?: number;
}
