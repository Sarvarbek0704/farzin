import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsIn, IsOptional, IsString, MaxLength, MinLength } from 'class-validator';

import { TOURNAMENT_STATUSES, type TournamentStatus } from '../tournament-status.machine';

/**
 * Holat o'tishi. Ruxsat etilgan o'tishlar — tournament-status.machine.ts;
 * CANCELLED uchun `reason` MAJBURIY (service tekshiradi, auditga kiradi).
 */
export class ChangeStatusDto {
  @ApiProperty({ enum: TOURNAMENT_STATUSES })
  @IsIn(TOURNAMENT_STATUSES)
  status!: TournamentStatus;

  @ApiPropertyOptional({ description: 'CANCELLED uchun majburiy — audit logga yoziladi' })
  @IsOptional()
  @IsString()
  @MinLength(3)
  @MaxLength(500)
  reason?: string;
}
