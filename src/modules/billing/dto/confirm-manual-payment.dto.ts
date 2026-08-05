import { ApiProperty } from '@nestjs/swagger';
import { IsString, MaxLength, MinLength } from 'class-validator';

/** Naqd to'lov tasdig'i — sabab MAJBURIY, audit logga yoziladi. */
export class ConfirmManualPaymentDto {
  @ApiProperty({ example: "Naqd to'lov kassada qabul qilindi, kvitansiya #124" })
  @IsString()
  @MinLength(3)
  @MaxLength(500)
  reason!: string;
}
