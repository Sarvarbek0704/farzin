import { ApiProperty } from '@nestjs/swagger';
import { IsString, MaxLength, MinLength } from 'class-validator';

/** Ro'yxatdan chiqarish — sabab MAJBURIY, audit logga yoziladi. */
export class WithdrawRegistrationDto {
  @ApiProperty({ example: "Sog'lik sababli qatnasha olmayman" })
  @IsString()
  @MinLength(3)
  @MaxLength(500)
  reason!: string;
}
