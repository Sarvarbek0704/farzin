import { ApiProperty } from '@nestjs/swagger';
import { IsString, MaxLength, MinLength } from 'class-validator';

/** Apellyatsiya — 30 kun oynada, boshqa tarkib ko'radi (docs/08 §4.2). */
export class SubmitAppealDto {
  @ApiProperty({
    example: "O'sha variantni Caruana-Karjakin partiyasidan tayyorlaganman, PGN ilova qilaman",
  })
  @IsString()
  @MinLength(10)
  @MaxLength(2000)
  reason!: string;
}
