import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsIn, IsInt, IsOptional, IsString, IsUUID, Max, Min } from 'class-validator';

import { MAX_PAGE_SIZE } from '../../../shared/pagination/cursor';
import { type TournamentStatus } from '../tournament-status.machine';

/**
 * Ommaviy kalendarda DRAFT hech qachon ko'rinmaydi — shuning uchun
 * filtrda ham yo'q.
 */
const PUBLIC_STATUSES = [
  'REGISTRATION_OPEN',
  'REGISTRATION_CLOSED',
  'IN_PROGRESS',
  'COMPLETED',
  'CANCELLED',
] as const satisfies readonly TournamentStatus[];

/** Cursor pagination + filtrlar — docs/04-api-spec.md §3. */
export class ListTournamentsQuery {
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

  @ApiPropertyOptional({ enum: PUBLIC_STATUSES })
  @IsOptional()
  @IsIn(PUBLIC_STATUSES)
  status?: (typeof PUBLIC_STATUSES)[number];

  @ApiPropertyOptional()
  @IsOptional()
  @IsUUID()
  regionId?: string;
}
