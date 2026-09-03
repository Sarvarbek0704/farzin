import { Module } from '@nestjs/common';

import { PlayerModule } from '../player/player.module';
import { FriendController } from './friend.controller';
import { FriendRepository } from './friend.repository';
import { FriendService } from './friend.service';

/**
 * Friend — o'yinchilar orasidagi do'stlik aloqasi.
 *
 * TZ'da bu modul YO'Q edi: unda faqat havola orqali "do'stona chaqiriq"
 * bor (docs/07-realtime-and-clock.md §9.5), ya'ni raqibning ID'sini
 * qayerdandir bilib olish kerak edi. Do'stlar ro'yxati shu bo'shliqni
 * to'ldiradi — chaqiriq oqimining o'zi o'zgarmaydi.
 *
 * Modul chegarasi: o'yinchi ma'lumoti PLAYER_PORT orqali
 * (`PlayerModule` eksport qiladi), `players` jadvaliga to'g'ridan-to'g'ri
 * so'rov faqat `include` ichida — u ham do'stlik qatoriga bog'langan
 * relation, alohida jadval so'rovi emas.
 */
@Module({
  imports: [PlayerModule],
  controllers: [FriendController],
  providers: [FriendService, FriendRepository],
})
export class FriendModule {}
