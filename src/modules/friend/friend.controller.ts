import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Post,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';

import { type Actor, CurrentActor } from '../identity/rbac.port';
import { FriendTargetDto } from './dto/friend-target.dto';
import type { FriendRow } from './friend.types';
import { FriendService } from './friend.service';

/**
 * Do'stlar — o'yinchining SHAXSIY aloqalari.
 *
 * ═══════════════════════════════════════════════════════════════════════════
 *  NEGA @RequirePermission YO'Q
 *
 *  RBAC bu loyihada TASHKILIY resurslarni qo'riqlaydi: turnir, hakam
 *  tayinlash, tashkilot (docs/03-domain-model.md §6). Do'stlik esa
 *  hech kimga tayinlanmaydi — u o'yinchining o'z ma'lumoti va uni
 *  faqat egasi o'zgartira oladi.
 *
 *  Shu sababli bu yerdagi ruxsat tekshiruvi ROLGA emas, EGALIKKA
 *  asoslanadi va u servisdagi `load()` da: a'zo bo'lmagan odam 404
 *  oladi — qator borligi ham oshkor bo'lmaydi. Rol qo'shish esa
 *  "admin do'st qo'shadi" degan ma'nosiz imkoniyat ochardi.
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * Autentifikatsiya baribir MAJBURIY: JwtAuthGuard global va bu yerda
 * @Public() yo'q.
 */
@ApiTags('friends')
@ApiBearerAuth('access-token')
@Controller('friends')
export class FriendController {
  constructor(private readonly friends: FriendService) {}

  @Get()
  @ApiOperation({ summary: "Do'stlarim" })
  list(@CurrentActor() actor: Actor): Promise<FriendRow[]> {
    return this.friends.listFriends(actor.userId);
  }

  @Get('requests')
  @ApiOperation({
    summary: "Kutilayotgan so'rovlar — kelgan va yuborilgan (`outgoing` bilan ajratiladi)",
  })
  requests(@CurrentActor() actor: Actor): Promise<FriendRow[]> {
    return this.friends.listPending(actor.userId);
  }

  @Get('blocks')
  @ApiOperation({ summary: 'Men bloklaganlar' })
  blocks(@CurrentActor() actor: Actor): Promise<FriendRow[]> {
    return this.friends.listBlocked(actor.userId);
  }

  @Post()
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: "Do'stlik so'rovini yuborish" })
  @ApiResponse({ status: 404, description: "O'yinchi topilmadi" })
  @ApiResponse({
    status: 422,
    description: "O'zingizga / allaqachon do'st / so'rov kutilmoqda / bloklangan",
  })
  request(@CurrentActor() actor: Actor, @Body() dto: FriendTargetDto): Promise<{ id: string }> {
    return this.friends.request(actor.userId, dto.playerId);
  }

  @Post(':id/accept')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: "So'rovni qabul qilish — faqat so'rov KELGAN tomon" })
  @ApiResponse({ status: 404, description: "So'rov topilmadi YOKI siz a'zo emassiz" })
  @ApiResponse({ status: 422, description: "Holat o'zgargan / siz so'rovchisiz" })
  accept(@CurrentActor() actor: Actor, @Param('id', ParseUUIDPipe) id: string): Promise<void> {
    return this.friends.accept(actor.userId, id);
  }

  @Delete('blocks/:id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Blokni ochish — faqat blok qo`ygan o`yinchi' })
  @ApiResponse({ status: 404, description: "Topilmadi YOKI siz a'zo emassiz" })
  @ApiResponse({ status: 422, description: 'Bloklanmagan / blokni siz qo`ymagansiz' })
  unblock(@CurrentActor() actor: Actor, @Param('id', ParseUUIDPipe) id: string): Promise<void> {
    return this.friends.unblock(actor.userId, id);
  }

  @Post('blocks')
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: "Bloklash — do'st bo'lmasa ham ishlaydi" })
  @ApiResponse({ status: 404, description: "O'yinchi topilmadi" })
  @ApiResponse({ status: 422, description: "O'zingizni bloklab bo'lmaydi" })
  block(@CurrentActor() actor: Actor, @Body() dto: FriendTargetDto): Promise<{ id: string }> {
    return this.friends.block(actor.userId, dto.playerId);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({
    summary: "Aloqani tugatish — kutilayotgan so'rovni rad etish yoki do'stlikdan chiqarish",
  })
  @ApiResponse({ status: 404, description: "Topilmadi YOKI siz a'zo emassiz" })
  @ApiResponse({ status: 422, description: 'Bloklangan juftlikni bu yo`l bilan ochib bo`lmaydi' })
  end(@CurrentActor() actor: Actor, @Param('id', ParseUUIDPipe) id: string): Promise<void> {
    return this.friends.end(actor.userId, id);
  }
}
