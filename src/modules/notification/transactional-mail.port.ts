import type { TemplateKey } from './notification.types';

/**
 * TRANZAKSION POCHTA — notification modulining PUBLIC porti.
 *
 * ═══════════════════════════════════════════════════════════════════════════
 *  NEGA `NotificationService.notifyUsers` DAN ALOHIDA
 *
 *  `notifyUsers` — BILDIRISHNOMA yo'li: u Notification qatorlarini yozadi,
 *  kanallarni foydalanuvchi sozlamasi bo'yicha tanlaydi va EMAIL kanalini
 *  `canDeliverTo` orqali filtrlaydi. EmailChannel esa qat'iy talab qiladi:
 *  `user.email !== null && user.emailVerified` — tasdiqlanmagan manzilga
 *  yozish spam va manzil-egallash xavfi (email.channel.ts izohi).
 *
 *  Aynan shu qoida email TASDIQLASH xatini imkonsiz qiladi: u
 *  tasdiqlanmagan manzilga ketishi SHART — u manzilni tasdiqlaydigan
 *  xatning o'zi. Xuddi shu holat parol tiklash uchun ham amal qiladi.
 *
 *  Shuning uchun tranzaksion pochta ALOHIDA yo'l:
 *   - Notification qatori YOZILMAYDI (bu bildirishnoma emas, auth oqimi
 *     qismi; foydalanuvchi uni "o'qilgan" deb belgilamaydi);
 *   - `emailVerified` tekshirilmaydi — ataylab, sababi yuqorida;
 *   - foydalanuvchi bildirishnoma sozlamalari qo'llanmaydi: xavfsizlik
 *     xatidan "obunani bekor qilib" bo'lmaydi.
 *
 *  ⚠️  BU YO'LGA FAQAT AUTH/XAVFSIZLIK XATLARI TUSHADI. Marketing yoki
 *      bildirishnoma uchun ishlatilsa — `emailVerified` himoyasi chetlab
 *      o'tiladi va bu spam demakdir.
 * ═══════════════════════════════════════════════════════════════════════════
 */
export interface TransactionalMailer {
  /**
   * Kanal umuman sozlanganmi (SMTP_HOST berilganmi).
   * Chaqiruvchi buni tekshirib, sozlanmagan muhitda o'z zaxira yo'lini
   * tanlashi mumkin (masalan dev'da tokenni log'ga chiqarish).
   */
  readonly enabled: boolean;

  /**
   * Bitta manzilga shablon bo'yicha xat.
   *
   * Xato YUQORIGA OTILADI — chaqiruvchi qaror qiladi. Ro'yxatdan o'tishda
   * masalan xat ketmagani butun registratsiyani yiqitmasligi kerak
   * (auth.service.ts izohi), lekin bu qaror auth modulida, bu yerda emas.
   */
  send(input: {
    to: string;
    templateKey: TemplateKey;
    /** `User.locale` — erkin string, normalizeLocale bilan keltiriladi. */
    locale: string;
    payload: Record<string, unknown>;
  }): Promise<void>;
}

/** DI tokeni — notification.module.ts provayder sifatida beradi. */
export const TRANSACTIONAL_MAILER = Symbol('TRANSACTIONAL_MAILER');
