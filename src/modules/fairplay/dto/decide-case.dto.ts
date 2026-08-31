import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsIn, IsISO8601, IsOptional, IsString, MaxLength } from 'class-validator';

import type { CaseDecisionValue } from '../fairplay.types';

/**
 * Komissiya qarori (docs/08 §4).
 *
 * rationale ATAYLAB @IsOptional: yo'qligi sintaksis xatosi (400) emas,
 * BIZNES qoidasi buzilishi — service 422 RATIONALE_REQUIRED beradi
 * ("majburiy yozma asos" — docs/14 Faza 6 DoD talabi RFC 9457 shaklida).
 */
export class DecideCaseDto {
  @ApiProperty({ enum: ['CLOSED_NO_ACTION', 'CLOSED_WARNING', 'CLOSED_SANCTION'] })
  @IsIn(['CLOSED_NO_ACTION', 'CLOSED_WARNING', 'CLOSED_SANCTION'])
  decision!: CaseDecisionValue;

  @ApiPropertyOptional({
    description: 'MAJBURIY yozma asos (kamida 20 belgi) — servisda 422 bilan tekshiriladi',
  })
  @IsOptional()
  @IsString()
  @MaxLength(4000)
  rationale?: string;

  @ApiPropertyOptional({
    description:
      "Faqat CLOSED_SANCTION bilan: sanksiya tugash sanasi (doimiy ban YO'Q — docs/08 §4.3)",
    example: '2027-01-01T00:00:00.000Z',
  })
  @IsOptional()
  @IsISO8601()
  sanctionUntil?: string;
}
