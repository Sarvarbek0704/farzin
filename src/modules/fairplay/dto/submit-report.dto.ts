import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString, IsUUID, MaxLength, MinLength } from 'class-validator';

/**
 * Odam shikoyati (docs/08 §7.4: FairPlayReport — shubhani RASMIY qayd
 * qilish, og'zaki emas). MANUAL_REPORT signal + tahlil navbati.
 */
export class SubmitReportDto {
  @ApiProperty({ description: "Shubhali o'yin (OnlineGame ID)" })
  @IsUUID()
  gameId!: string;

  @ApiProperty({
    example: "Raqib 30-yurishdan keyin har pozitsiyada 4 soniyada eng yaxshi yurishni topdi",
    description: 'Shikoyat asosi — komissiya o\'qiydi',
  })
  @IsString()
  @MinLength(10)
  @MaxLength(1000)
  reason!: string;

  @ApiPropertyOptional({
    description:
      "Gumon qilingan o'yinchi. Berilmasa: shikoyatchi o'yin ishtirokchisi bo'lsa — raqibi",
  })
  @IsOptional()
  @IsUUID()
  suspectPlayerId?: string;
}
