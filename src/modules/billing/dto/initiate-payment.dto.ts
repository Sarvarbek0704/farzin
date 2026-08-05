import { ApiProperty } from '@nestjs/swagger';
import { IsIn } from 'class-validator';

import { INITIATABLE_PROVIDERS, type InitiatableProvider } from '../billing.types';

/**
 * To'lov boshlash — `Idempotency-Key` header MAJBURIY (docs/04 §5),
 * u DTO emas, controller'da tekshiriladi (header, body emas).
 */
export class InitiatePaymentDto {
  @ApiProperty({ enum: INITIATABLE_PROVIDERS, example: 'MANUAL' })
  @IsIn(INITIATABLE_PROVIDERS)
  provider!: InitiatableProvider;
}
