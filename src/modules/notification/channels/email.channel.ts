import { Inject, Injectable, Logger, Optional } from '@nestjs/common';
import type { Transporter } from 'nodemailer';

import type { NotificationRow, RecipientUser } from '../notification.types';
import { renderTemplate } from '../templates';
import type { NotificationChannelAdapter } from './channel.port';

/**
 * SMTP transport tokeni — notification.module.ts fabrikasi quradi.
 * `null` = SMTP_HOST berilmagan → kanal TOZA o'chirilgan (provider-gating,
 * fairplay STOCKFISH_PATH pretsedenti). Unit testda jsonTransport beriladi.
 */
export const MAIL_TRANSPORT = Symbol('MAIL_TRANSPORT');

/** `From:` manzil tokeni (config mail.from; transport null bo'lsa ham bor). */
export const MAIL_FROM = Symbol('MAIL_FROM');

/**
 * EMAIL kanal — nodemailer/SMTP (dev'da mailpit: docker-compose.yml
 * 1025-port, web UI 8025).
 *
 * Qoidalar:
 *  - FAQAT tasdiqlangan manzil (`emailVerified`) — tasdiqlanmagan manzilga
 *    yozish spam va manzil-egallash xavfi (docs/10-security.md);
 *  - matn shablon registry'dan foydalanuvchi tilida render qilinadi
 *    (templates.ts, fallback uz-Latn);
 *  - oddiy text email — HTML shablonlar keyingi bosqich (dizayn kerak);
 *  - SIRLAR LOGLANMAYDI: SMTP_USER/SMTP_PASSWORD hech qayerda log'ga
 *    chiqmaydi (docs/10-security.md §8) — bu fayl faqat xato message'ini
 *    yuqoriga otadi, service uni failureReason'ga yozadi.
 */
@Injectable()
export class EmailChannel implements NotificationChannelAdapter {
  private readonly logger = new Logger(EmailChannel.name);

  readonly channel = 'EMAIL' as const;

  constructor(
    @Optional() @Inject(MAIL_TRANSPORT) private readonly transport: Transporter<unknown> | null,
    @Inject(MAIL_FROM) private readonly from: string,
  ) {
    if (this.transport === null) {
      // Bir marta, ishga tushishda — "nega email ketmayapti?" savoliga javob.
      this.logger.log("SMTP_HOST berilmagan — EMAIL kanali o'chirilgan (IN_APP ishlayveradi)");
    }
  }

  get enabled(): boolean {
    return this.transport !== null;
  }

  canDeliverTo(user: RecipientUser): boolean {
    return user.email !== null && user.emailVerified;
  }

  async send(notification: NotificationRow, user: RecipientUser): Promise<void> {
    if (this.transport === null || user.email === null) {
      // Service enabled/canDeliverTo bilan filtrlaydi — bu himoya qatlami.
      throw new Error("EMAIL kanali sozlanmagan yoki manzil yo'q");
    }
    const rendered = renderTemplate(notification.templateKey, user.locale, notification.payload);
    if (rendered === null) {
      throw new Error(`Shablon topilmadi: ${notification.templateKey}`);
    }
    await this.transport.sendMail({
      from: this.from,
      to: user.email,
      subject: rendered.subject,
      text: rendered.body,
    });
  }
}
