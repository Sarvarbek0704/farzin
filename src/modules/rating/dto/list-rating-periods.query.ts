import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsIn, IsInt, IsOptional, IsString, Max, Min } from 'class-validator';

import { MAX_PAGE_SIZE } from '../../../shared/pagination/cursor';
import {
  PLAY_ENVIRONMENTS,
  type PlayEnvironment,
  TIME_CATEGORIES,
  type TimeCategory,
} from '../rating.types';

/** Rating davrlari ro'yxati — ixtiyoriy kategoriya filtri. */
export class ListRatingPeriodsQuery {
  @ApiPropertyOptional({ enum: PLAY_ENVIRONMENTS })
  @IsOptional()
  @IsIn(PLAY_ENVIRONMENTS)
  environment?: PlayEnvironment;

  @ApiPropertyOptional({ enum: TIME_CATEGORIES })
  @IsOptional()
  @IsIn(TIME_CATEGORIES)
  timeCategory?: TimeCategory;

  @ApiPropertyOptional({ minimum: 1, maximum: MAX_PAGE_SIZE, default: 20 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(MAX_PAGE_SIZE)
  first?: number;

  @ApiPropertyOptional({ description: 'Oldingi javobdagi pageInfo.endCursor' })
  @IsOptional()
  @IsString()
  after?: string;
}
