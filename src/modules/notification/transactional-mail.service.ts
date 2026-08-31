import { Inject, Injectable, Logger, Optional } from '@nestjs/common';
import type { Transporter } from 'nodemailer';

import { MAIL_FROM, MAIL_TRANSPORT } from './channels/email.channel';
import type { TemplateKey } from './notification.types';
import { renderTemplate } from './templates';
import type { TransactionalMailer } from './transactional-mail.port';

/**
 * TransactionalMailer implementatsiyasi — nodemailer/SMTP.
 *
 * Nega EmailChannel qayta ishlatilmaydi: u `NotificationRow` va
 * `RecipientUser` bilan ishlaydi (DB qatorlari) va `canDeliverTo` da
 * `emailVerified` ni talab qiladi. Bu yerda esa DB qatori yo'q — faqat
 * manzil, shablon va payload. Transport va `from` esa BIR XIL
 * provayderlardan olinadi, ya'ni SMTP konfiguratsiyasi bitta joyda
 * (notification.module.ts) qoladi.
 *
 * Sozlanmagan muhit (SMTP_HOST yo'q) → `enabled = false` va `send`
 * xato tashlaydi. Bu billing ClickProvider va fairplay STOCKFISH_PATH
 * bilan bir xil "provider gating" naqshi: jimgina muvaffaqiyat
 * QAYTARILMAYDI, aks holda xat ketmagani sezilmay qoladi.
 */
@Injectable()
export class TransactionalMailService implements TransactionalMailer {
  private readonly logger = new Logger(TransactionalMailService.name);

  constructor(
    @Optional() @Inject(MAIL_TRANSPORT) private readonly transport: Transporter<unknown> | null,
    @Inject(MAIL_FROM) private readonly from: string,
  ) {}

  get enabled(): boolean {
    return this.transport !== null;
  }

  async send(input: {
    to: string;
    templateKey: TemplateKey;
    locale: string;
    payload: Record<string, unknown>;
  }): Promise<void> {
    if (this.transport === null) {
      throw new Error("SMTP sozlanmagan — tranzaksion xat yuborib bo'lmaydi");
    }

    const rendered = renderTemplate(input.templateKey, input.locale, input.payload);
    if (rendered === null) {
      throw new Error(`Shablon topilmadi: ${input.templateKey}`);
    }

    await this.transport.sendMail({
      from: this.from,
      to: input.to,
      subject: rendered.subject,
      text: rendered.body,
    });

    // ⚠️  MANZIL HAM, TOKEN HAM LOG'GA CHIQMAYDI (docs/10-security.md §8):
    //     manzil — PII, payload esa bir martalik sirni olib yuradi.
    this.logger.debug(`Tranzaksion xat yuborildi: ${input.templateKey}`);
  }
}
