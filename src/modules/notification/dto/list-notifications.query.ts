import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsIn, IsInt, IsOptional, IsString, Max, Min } from 'class-validator';

import { MAX_PAGE_SIZE } from '../../../shared/pagination/cursor';

/** O'z xabarlari ro'yxati — cursor pagination (docs/04-api-spec.md §3). */
export class ListNotificationsQuery {
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
   * ?unread=true — faqat o'qilmaganlar. Query string'da boolean yo'q,
   * `enableImplicitConversion` ham o'chirilgan (main.ts) — aniq literal.
   */
  @ApiPropertyOptional({ enum: ['true', 'false'] })
  @IsOptional()
  @IsIn(['true', 'false'])
  unread?: 'true' | 'false';
}
