import { Inject, Injectable, Logger } from '@nestjs/common';

import { NotFoundError } from '../../core/errors/domain.error';
import {
  DEFAULT_PAGE_SIZE,
  decodeCursor,
  type Page,
  toPage,
} from '../../shared/pagination/cursor';
import {
  NOTIFICATION_CHANNEL_ADAPTERS,
  type NotificationChannelAdapter,
} from './channels/channel.port';
import { NotificationRepository } from './notification.repository';
import type {
  NotificationChannelValue,
  NotificationRow,
  NotificationView,
  RecipientUser,
  TemplateKey,
} from './notification.types';

/**
 * Notification orkestratsiyasi — docs/01-product-spec.md §2.14,
 * docs/02-architecture.md §6.2 (notification event tinglovchisi).
 *
 * IKKI FAZALI dispatch (`notifyUsers`):
 *
 *  1. YOZISH — qabul qiluvchi×kanal qatorlari BIR tranzaksiyada, idempotent
 *     (repository createBatchIdempotent). DB xatosi SHU YERDA throw bo'ladi
 *     va outbox publisher'ga chiqadi — bu ATAYLAB: publisher event'ni
 *     PENDING qoldirib backoff bilan qayta uriniladi (ADR-0008), dedupe
 *     takror yetkazishdan himoya qiladi.
 *
 *  2. YETKAZISH — har qator uchun kanal adapteri; xato → markFailed(reason)
 *     va HECH QACHON tashqariga otilmaydi (log + davom): bitta email
 *     xatosi qolgan qabul qiluvchilarni ham, outbox event'ni ham
 *     bloklamasligi kerak. Trade-off hujjatlangan: yetkazish xatosi
 *     event retry'ini KELTIRMAYDI — failedAt/failureReason qatorda
 *     turadi, qayta yuborish job'i keyingi bosqich.
 */
@Injectable()
export class NotificationService {
  private readonly logger = new Logger(NotificationService.name);

  private readonly adapterByChannel: ReadonlyMap<
    NotificationChannelValue,
    NotificationChannelAdapter
  >;

  constructor(
    private readonly repo: NotificationRepository,
    @Inject(NOTIFICATION_CHANNEL_ADAPTERS) adapters: NotificationChannelAdapter[],
  ) {
    this.adapterByChannel = new Map(adapters.map((a) => [a.channel, a]));
  }

  // --- Event tomonidan chaqiriladigan orkestratsiya ------------------------------

  /**
   * Foydalanuvchilar to'plamiga xabar: qator yaratish + mavjud kanallarga
   * yetkazish. Qaytaradi: nechta YANGI qator yaratildi (takror yetkazishda 0).
   */
  async notifyUsers(input: {
    eventId: string;
    templateKey: TemplateKey;
    payload: Record<string, unknown>;
    userIds: readonly string[];
    channels: readonly NotificationChannelValue[];
  }): Promise<number> {
    const users = await this.repo.recipientsByIds(input.userIds);
    if (users.length === 0) {
      return 0;
    }

    const rows: { userId: string; channel: NotificationChannelValue }[] = [];
    for (const user of users) {
      for (const channel of eligibleChannels(input.channels, this.adapterByChannel, user)) {
        rows.push({ userId: user.id, channel });
      }
    }

    const created = await this.repo.createBatchIdempotent({
      eventId: input.eventId,
      templateKey: input.templateKey,
      payload: input.payload,
      rows,
    });
    if (created.length === 0) {
      return 0; // Takror yetkazish (at-least-once) — dedupe ishladi.
    }

    const userById = new Map(users.map((u) => [u.id, u]));
    await this.dispatch(created, userById);
    return created.length;
  }

  /** 2-faza: yetkazish. Xatolar YUTILADI (markFailed + log) — hujjat yuqorida. */
  private async dispatch(
    created: readonly NotificationRow[],
    userById: ReadonlyMap<string, RecipientUser>,
  ): Promise<void> {
    for (const notification of created) {
      const adapter = this.adapterByChannel.get(notification.channel);
      const user = userById.get(notification.userId);
      try {
        if (adapter === undefined || user === undefined) {
          // Bo'lmasligi kerak (rows adapterlardan qurilgan) — himoya qatlami.
          await this.repo.markFailed(notification.id, 'CHANNEL_ADAPTER_MISSING');
          continue;
        }
        await adapter.send(notification, user);
        await this.repo.markSent(notification.id);
      } catch (err) {
        const reason = err instanceof Error ? err.message : String(err);
        try {
          await this.repo.markFailed(notification.id, reason);
        } catch (markErr) {
          // markFailed ham yiqildi (DB uzilishi) — faqat log, event loop toza.
          this.logger.error(
            `markFailed yiqildi (notification=${notification.id}): ${String(markErr)}`,
          );
        }
        this.logger.warn(
          `Yetkazish xatosi (channel=${notification.channel}, notification=${notification.id}): ${reason}`,
        );
      }
    }
  }

  // --- Foydalanuvchi API'si (controller) -----------------------------------------

  async listForUser(
    userId: string,
    query: { first?: number; after?: string; unread?: boolean },
  ): Promise<Page<NotificationView>> {
    const first = query.first ?? DEFAULT_PAGE_SIZE;
    const afterId = query.after !== undefined ? decodeCursor(query.after) : null;
    const rows = await this.repo.listForUser(userId, first, afterId, query.unread === true);
    const page = toPage(rows, first);
    return { items: page.items.map(toView), pageInfo: page.pageInfo };
  }

  async unreadCount(userId: string): Promise<{ count: number }> {
    return { count: await this.repo.unreadCount(userId) };
  }

  /** O'z xabari emas yoki mavjud emas → 404 (deny→404, docs/04 §2.4). */
  async markRead(userId: string, notificationId: string): Promise<NotificationView> {
    const row = await this.repo.markRead(notificationId, userId);
    if (row === null) {
      throw new NotFoundError('Notification', notificationId);
    }
    return toView(row);
  }

  async markAllRead(userId: string): Promise<{ updated: number }> {
    return { updated: await this.repo.markAllRead(userId) };
  }
}

function toView(row: NotificationRow): NotificationView {
  return {
    id: row.id,
    channel: row.channel,
    templateKey: row.templateKey,
    payload: row.payload,
    sentAt: row.sentAt,
    readAt: row.readAt,
    createdAt: row.createdAt,
  };
}

/**
 * Kanal tanlash — SOF funksiya (unit test: channel-selection.spec.ts).
 *
 * Kanal qatorga aylanadi FAQAT: (1) adapter mavjud, (2) kanal sozlangan
 * (enabled — provider-gating), (3) foydalanuvchi qabul qila oladi
 * (canDeliverTo — masalan EMAIL faqat tasdiqlangan manzil). Aks holda
 * qator UMUMAN yaratilmaydi — abadiy FAILED qator chiqarilmaydi.
 */
export function eligibleChannels(
  requested: readonly NotificationChannelValue[],
  adapterByChannel: ReadonlyMap<
    NotificationChannelValue,
    Pick<NotificationChannelAdapter, 'enabled' | 'canDeliverTo'>
  >,
  user: RecipientUser,
): NotificationChannelValue[] {
  return requested.filter((channel) => {
    const adapter = adapterByChannel.get(channel);
    return adapter !== undefined && adapter.enabled && adapter.canDeliverTo(user);
  });
}
