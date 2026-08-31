import { createTransport, type Transporter } from 'nodemailer';

import type { NotificationRow, RecipientUser } from '../notification.types';
import { EmailChannel } from './email.channel';

/**
 * EMAIL kanal — LOKAL nodemailer jsonTransport bilan (tarmoq YO'Q).
 *
 * Nega jsonTransport: mock siyosati (docs/13) tashqi tarmoq chegarasini
 * mock qilishga ruxsat beradi; jsonTransport nodemailer'ning O'Z lokal
 * transporti — xabar yuborilmaydi, JSON sifatida qaytadi. Integration
 * harness'da SMTP ATAYLAB o'chiq (app.harness.ts SMTP_HOST='') — real
 * SMTP yo'li shu suite bilan qoplanadi.
 */

function notification(overrides: Partial<NotificationRow> = {}): NotificationRow {
  return {
    id: 'n1',
    userId: 'u1',
    channel: 'EMAIL',
    templateKey: 'payment.completed',
    payload: {
      eventId: 'e1',
      invoiceNumber: 'FRZ-2026-000007',
      amountTiyin: '5000000',
      currency: 'UZS',
    },
    sentAt: null,
    readAt: null,
    failedAt: null,
    failureReason: null,
    createdAt: new Date(),
    ...overrides,
  };
}

function recipient(overrides: Partial<RecipientUser> = {}): RecipientUser {
  return {
    id: 'u1',
    email: 'oyinchi@test.uz',
    emailVerified: true,
    locale: 'ru',
    ...overrides,
  };
}

describe('EmailChannel', () => {
  it('jsonTransport orqali yuboradi: from/to/subject/body foydalanuvchi tilida', async () => {
    const transport = createTransport({ jsonTransport: true }) as Transporter<unknown>;
    const sendMail = jest.spyOn(transport, 'sendMail');
    const channel = new EmailChannel(transport, 'no-reply@farzin.uz');

    expect(channel.enabled).toBe(true);
    await channel.send(notification(), recipient());

    expect(sendMail).toHaveBeenCalledTimes(1);
    const args = sendMail.mock.calls[0]![0];
    expect(args.from).toBe('no-reply@farzin.uz');
    expect(args.to).toBe('oyinchi@test.uz');
    // locale=ru → ruscha shablon (templates.ts)
    expect(args.subject).toBe('Платёж получен');
    expect(typeof args.text).toBe('string');
    expect(args.text as string).toContain('FRZ-2026-000007');
  });

  it("noma'lum locale → uz-Latn fallback bilan yuboradi", async () => {
    const transport = createTransport({ jsonTransport: true }) as Transporter<unknown>;
    const sendMail = jest.spyOn(transport, 'sendMail');
    const channel = new EmailChannel(transport, 'no-reply@farzin.uz');

    await channel.send(notification(), recipient({ locale: 'fr' }));

    const args = sendMail.mock.calls[0]![0];
    expect(args.subject).toBe("To'lov qabul qilindi");
  });

  it("transport null (SMTP_HOST yo'q) → enabled=false va send reject", async () => {
    const channel = new EmailChannel(null, 'no-reply@farzin.uz');
    expect(channel.enabled).toBe(false);
    await expect(channel.send(notification(), recipient())).rejects.toThrow();
  });

  it("noma'lum templateKey → reject (service markFailed qiladi)", async () => {
    const transport = createTransport({ jsonTransport: true }) as Transporter<unknown>;
    const channel = new EmailChannel(transport, 'no-reply@farzin.uz');
    await expect(
      channel.send(notification({ templateKey: 'no.such.key' }), recipient()),
    ).rejects.toThrow('Shablon topilmadi');
  });

  describe('canDeliverTo — faqat tasdiqlangan manzil (docs/10)', () => {
    const channel = new EmailChannel(null, 'no-reply@farzin.uz');

    it('tasdiqlangan email → true', () => {
      expect(channel.canDeliverTo(recipient())).toBe(true);
    });

    it("tasdiqlanmagan yoki yo'q email → false", () => {
      expect(channel.canDeliverTo(recipient({ emailVerified: false }))).toBe(false);
      expect(channel.canDeliverTo(recipient({ email: null }))).toBe(false);
    });
  });
});
