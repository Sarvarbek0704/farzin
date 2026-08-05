import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsInt, IsOptional, IsString, Max, Min } from 'class-validator';

import { MAX_PAGE_SIZE } from '../../../shared/pagination/cursor';

/** O'z invoyslari ro'yxati — cursor pagination (docs/04-api-spec.md §3). */
export class ListInvoicesQuery {
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
