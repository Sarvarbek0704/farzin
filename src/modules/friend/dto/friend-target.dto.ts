import { ApiProperty } from '@nestjs/swagger';
import { IsUUID } from 'class-validator';

/**
 * So'rov / blok uchun maqsad o'yinchi.
 *
 * ID YO'LDA EMAS, TANADA: `POST /friends/:playerId` ko'rinishi
 * qulayroq bo'lardi, lekin u holda o'yinchi ID'si server loglariga,
 * proksi loglariga va brauzer tarixiga URL sifatida tushardi.
 * "Kim kimga so'rov yuborgani" — shaxsiy ma'lumot; uni URL'ga
 * chiqarmaymiz (docs/10-security.md §8 bilan bir yo'nalishda).
 */
export class FriendTargetDto {
  @ApiProperty({ format: 'uuid', description: "Maqsad o'yinchining (Player) ID'si" })
  @IsUUID()
  playerId!: string;
}
