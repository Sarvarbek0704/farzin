import {
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';

import type { AuthenticatedUser } from '../../shared/auth/authenticated-user';
import { CurrentUser } from '../../shared/auth/current-user.decorator';
import type { Page } from '../../shared/pagination/cursor';
import { ListNotificationsQuery } from './dto/list-notifications.query';
import { NotificationService } from './notification.service';
import type { NotificationView } from './notification.types';

/**
 * Notification endpointlari — FAQAT O'Z xabarlari.
 *
 * RUXSAT QARORI (hujjatlangan): `Notification` docs/01 §4.1 RBAC
 * matritsasida YO'Q — bu sof shaxsiy ("own") resurs, rol farqi yo'q.
 * Shuning uchun @RequirePermission ishlatilmaydi (billing createInvoice
 * pretsedenti); autentifikatsiya global JwtAuthGuard bilan (default yopiq,
 * app.module.ts), egalik esa HAR so'rovda repository darajasida userId
 * qamrovi bilan — boshqa userning xabari 404 (IDOR, docs/04 §2.4).
 */
@ApiTags('notifications')
@Controller('notifications')
export class NotificationController {
  constructor(private readonly notifications: NotificationService) {}

  @Get()
  @ApiBearerAuth('access-token')
  @ApiOperation({ summary: "O'z xabarlari (IN_APP feed, cursor, ?unread=true)" })
  list(
    @CurrentUser() user: AuthenticatedUser,
    @Query() query: ListNotificationsQuery,
  ): Promise<Page<NotificationView>> {
    return this.notifications.listForUser(user.userId, {
      ...(query.first !== undefined && { first: query.first }),
      ...(query.after !== undefined && { after: query.after }),
      ...(query.unread !== undefined && { unread: query.unread === 'true' }),
    });
  }

  @Get('unread-count')
  @ApiBearerAuth('access-token')
  @ApiOperation({ summary: "O'qilmagan xabarlar soni (badge)" })
  unreadCount(@CurrentUser() user: AuthenticatedUser): Promise<{ count: number }> {
    return this.notifications.unreadCount(user.userId);
  }

  @Post(':id/read')
  @HttpCode(HttpStatus.OK)
  @ApiBearerAuth('access-token')
  @ApiOperation({ summary: "Xabarni o'qildi qilish — faqat o'ziniki, idempotent" })
  @ApiResponse({ status: 404, description: "Boshqa userning xabari — 404 (403 emas)" })
  markRead(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<NotificationView> {
    return this.notifications.markRead(user.userId, id);
  }

  @Post('read-all')
  @HttpCode(HttpStatus.OK)
  @ApiBearerAuth('access-token')
  @ApiOperation({ summary: "Barchasini o'qildi qilish" })
  markAllRead(@CurrentUser() user: AuthenticatedUser): Promise<{ updated: number }> {
    return this.notifications.markAllRead(user.userId);
  }
}
