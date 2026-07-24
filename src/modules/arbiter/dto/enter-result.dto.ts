import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsIn, IsOptional, IsString, MaxLength } from 'class-validator';

import { ENTERABLE_RESULTS, type EnterableResult } from '../arbiter.types';

/**
 * Natija kiritish/tuzatish. UNPLAYED qabul qilinmaydi — u "hali
 * o'ynalmagan" default holat, natija emas (arbiter.types.ts).
 * Mavjud natijani O'ZGARTIRISHDA `reason` majburiy (service tekshiradi,
 * audit logga yoziladi — docs/14-roadmap.md Faza 1).
 */
export class EnterResultDto {
  @ApiProperty({ enum: ENTERABLE_RESULTS })
  @IsIn(ENTERABLE_RESULTS)
  result!: EnterableResult;

  @ApiPropertyOptional({
    description: "Natijani o'zgartirishda MAJBURIY — audit logga yoziladi",
    maxLength: 500,
  })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  reason?: string;
}
