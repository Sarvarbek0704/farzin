import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsInt, IsOptional, IsString, Max, MaxLength, Min, MinLength } from 'class-validator';

import { MAX_PAGE_SIZE } from '../../../shared/pagination/cursor';

/** Cursor pagination parametrlari — docs/04-api-spec.md §3. */
export class ListPlayersQuery {
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

  /**
   * Ism bo'yicha qidiruv.
   *
   * MINIMAL 2 BELGI: bitta harf butun jadvalni qaytarardi va bu
   * ro'yxatni "hamma o'yinchilarni yuklab olish" vositasiga
   * aylantirardi.
   */
  @ApiPropertyOptional({ minLength: 2, maxLength: 60, description: 'Ism/familiya (kirilcha ham)' })
  @IsOptional()
  @IsString()
  @MinLength(2)
  @MaxLength(60)
  q?: string;
}
