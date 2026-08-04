import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsIn, IsInt, IsOptional, IsString, Max, Min } from 'class-validator';

import { MAX_PAGE_SIZE } from '../../../shared/pagination/cursor';
import {
  PLAY_ENVIRONMENTS,
  type PlayEnvironment,
  TIME_CATEGORIES,
  type TimeCategory,
} from '../rating.types';

/**
 * Ommaviy leaderboard — kategoriya MAJBURIY (basseynlar mustaqil,
 * docs/06 §5.3: aralash ro'yxatning ma'nosi yo'q).
 */
export class LeaderboardQuery {
  @ApiProperty({ enum: PLAY_ENVIRONMENTS })
  @IsIn(PLAY_ENVIRONMENTS)
  environment!: PlayEnvironment;

  @ApiProperty({ enum: TIME_CATEGORIES })
  @IsIn(TIME_CATEGORIES)
  timeCategory!: TimeCategory;

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
