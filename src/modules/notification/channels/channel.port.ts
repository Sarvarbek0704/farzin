import type {
  NotificationChannelValue,
  NotificationRow,
  RecipientUser,
} from '../notification.types';

/**
 * Yetkazish kanali adapteri — billing PaymentProviderAdapter pattern'i
 * (docs/02-architecture.md §6.1 port tamoyili, modul ICHIDAGI port).
 *
 * Yangi kanal qo'shish tartibi: yangi adapter fayli + notification.module.ts
 * ro'yxatiga BITTA qator. Service kanal nomi bo'yicha dispatch qiladi,
 * implementatsiyani bilmaydi.
 */
export interface NotificationChannelAdapter {
  readonly channel: NotificationChannelValue;

  /**
   * Kanal umuman sozlanganmi (provider-gating — billing Click stub'i va
   * fairplay STOCKFISH_PATH pretsedenti): sozlanmagan kanal uchun
   * Notification qatori UMUMAN yaratilmaydi — abadiy FAILED qator
   * chiqarishdan ko'ra toza.
   */
  readonly enabled: boolean;

  /**
   * Aynan SHU foydalanuvchiga yetkaza oladimi (masalan EMAIL —
   * faqat tasdiqlangan manzil). Service qator yaratishdan OLDIN chaqiradi.
   */
  canDeliverTo(user: RecipientUser): boolean;

  /**
   * Yetkazish. Xato — reject; service ushlab markFailed qiladi va
   * HECH QACHON event loop'ga otmaydi (notification.service.ts).
   */
  send(notification: NotificationRow, user: RecipientUser): Promise<void>;
}

/** Barcha adapterlar massivi tokeni (billing PAYMENT_PROVIDERS pattern'i). */
export const NOTIFICATION_CHANNEL_ADAPTERS = Symbol('NOTIFICATION_CHANNEL_ADAPTERS');
