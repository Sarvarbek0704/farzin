import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsIn, IsOptional, IsString, MaxLength } from 'class-validator';

import type { AppealDecisionValue } from '../fairplay.types';

/**
 * Apellyatsiya qarori (docs/08 §4.2 5-band). decision matni MAJBURIY —
 * service 422 APPEAL_DECISION_TEXT_REQUIRED (DecideCaseDto bilan bir xil
 * sabab: biznes qoidasi, sintaksis emas).
 */
export class DecideAppealDto {
  @ApiProperty({ enum: ['UPHELD', 'REJECTED'] })
  @IsIn(['UPHELD', 'REJECTED'])
  status!: AppealDecisionValue;

  @ApiPropertyOptional({
    description: 'Yozma qaror matni (kamida 20 belgi) — 422 bilan tekshiriladi',
  })
  @IsOptional()
  @IsString()
  @MaxLength(4000)
  decision?: string;
}
