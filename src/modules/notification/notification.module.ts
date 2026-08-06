import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createTransport, type Transporter } from 'nodemailer';

import type { AppConfig } from '../../config/configuration';
import { NOTIFICATION_CHANNEL_ADAPTERS, type NotificationChannelAdapter } from './channels/channel.port';
import { EmailChannel, MAIL_FROM, MAIL_TRANSPORT } from './channels/email.channel';
import { InAppChannel } from './channels/in-app.channel';
import { PushChannel } from './channels/push.channel';
import { SmsChannel } from './channels/sms.channel';
import { TelegramChannel } from './channels/telegram.channel';
import { NotificationOutboxListeners } from './listeners/outbox.listeners';
import { NotificationController } from './notification.controller';
import { NotificationRepository } from './notification.repository';
import { NotificationService } from './notification.service';

/**
 * Notification — [CANON 5] #14: SMS, push, Telegram, email, in-app.
 * docs/01-product-spec.md §2.14, docs/02-architecture.md §6.2.
 *
 * Outbox event'larining BIRINCHI haqiqiy iste'molchisi (shu paytgacha
 * publisher bo'shliqqa emit qilardi): RoundCompleted / PaymentCompleted /
 * RefundIssued / FairPlayCaseOpened / RatingRecomputed tinglanadi
 * (listeners/outbox.listeners.ts — har biri idempotent, ADR-0008).
 *
 * Kanal holati:
 *  - IN_APP — to'liq (DB qatori = yetkazish);
 *  - EMAIL  — nodemailer/SMTP, SMTP_HOST bo'lsagina yoqiladi (dev: mailpit);
 *  - SMS/PUSH/TELEGRAM — hujjatlangan stub'lar (billing Click pretsedenti:
 *    kredensial va rasmiy hujjatsiz API O'YLAB TOPILMAYDI).
 *
 * Import yo'q: PrismaModule/OutboxModule global; identity portlari kerak
 * emas (endpointlar own-only — notification.controller.ts sarlavhasi).
 */
@Module({
  controllers: [NotificationController],
  providers: [
    NotificationService,
    NotificationRepository,
    NotificationOutboxListeners,
    InAppChannel,
    SmsChannel,
    PushChannel,
    TelegramChannel,
    EmailChannel,
    {
      // SMTP transport — provider-gating: mail=null → transport=null →
      // EmailChannel.enabled=false (fairplay STOCKFISH_PATH pretsedenti).
      provide: MAIL_TRANSPORT,
      useFactory: (config: ConfigService<AppConfig, true>): Transporter<unknown> | null => {
        const mail = config.get('mail', { infer: true });
        if (mail === null) {
          return null;
        }
        return createTransport({
          host: mail.host,
          port: mail.port,
          // Dev SMTP (mailpit) TLS'siz; prod'da STARTTLS portga qarab
          // nodemailer o'zi keladi (secure=true faqat 465).
          secure: mail.port === 465,
          ...(mail.user !== undefined &&
            mail.password !== undefined && {
              auth: { user: mail.user, pass: mail.password },
            }),
        });
      },
      inject: [ConfigService],
    },
    {
      provide: MAIL_FROM,
      useFactory: (config: ConfigService<AppConfig, true>): string => {
        const mail = config.get('mail', { infer: true });
        return mail?.from ?? 'no-reply@farzin.uz';
      },
      inject: [ConfigService],
    },
    {
      provide: NOTIFICATION_CHANNEL_ADAPTERS,
      useFactory: (
        inApp: InAppChannel,
        email: EmailChannel,
        sms: SmsChannel,
        push: PushChannel,
        telegram: TelegramChannel,
      ): NotificationChannelAdapter[] => [inApp, email, sms, push, telegram],
      inject: [InAppChannel, EmailChannel, SmsChannel, PushChannel, TelegramChannel],
    },
  ],
})
export class NotificationModule {}
