import { ApiProperty } from '@nestjs/swagger';
import { IsString, MaxLength, MinLength } from 'class-validator';

/**
 * Davrni hisoblash/qayta hisoblash — sabab MAJBURIY: 'rating.recalculated'
 * auditda REASON_REQUIRED (shared/audit/audit.service.ts, docs/06 §9.5).
 */
export class ComputePeriodDto {
  @ApiProperty({
    example: "Oylik reja bo'yicha davr yakuni",
    description: 'Nega hisoblanmoqda — auditga kiradi',
  })
  @IsString()
  @MinLength(3)
  @MaxLength(500)
  reason!: string;
}
