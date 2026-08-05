import { ApiProperty } from '@nestjs/swagger';
import { IsString, MaxLength, MinLength } from 'class-validator';

/** Refund — sabab MAJBURIY (docs/09 §8.2, audit 'refund.requested'). */
export class RefundPaymentDto {
  @ApiProperty({ example: 'Turnir tashkilotchi tomonidan bekor qilindi' })
  @IsString()
  @MinLength(3)
  @MaxLength(500)
  reason!: string;
}
