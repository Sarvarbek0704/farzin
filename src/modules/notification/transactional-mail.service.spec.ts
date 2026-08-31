import { createTransport, type Transporter } from 'nodemailer';

import { TransactionalMailService } from './transactional-mail.service';

/**
 * Tranzaksion pochta — LOKAL nodemailer jsonTransport bilan (tarmoq YO'Q).
 * email.channel.spec.ts bilan bir xil naqsh: jsonTransport nodemailer'ning
 * o'z lokal transporti — xabar yuborilmaydi, JSON sifatida qaytadi.
 *
 * ═══════════════════════════════════════════════════════════════════════════
 *  BU TEST NIMANI QO'RIQLAYDI (docs/AUDIT.md KRITIK-3)
 *
 *  Ilgari `auth.service.sendEmailVerification` tokenni yaratib Redis'ga
 *  yozardi va TO'XTARDI — xat hech qayerga ketmasdi. Prod'da dev-log ham
 *  chiqmasdi, ya'ni foydalanuvchi manzilini HECH QACHON tasdiqlay olmasdi.
 *
 *  Bu yerda tekshiriladi: yo'l haqiqatan xat YASAYDI, unda tasdiqlash
 *  havolasi BOR va u to'g'ri tilda.
 * ═══════════════════════════════════════════════════════════════════════════
 */

interface SentMail {
  to: string;
  subject: string;
  text: string;
}

/** jsonTransport javobidan yuborilgan xatni ajratib olish. */
function parseSent(info: unknown): SentMail {
  const message = (info as { message: string }).message;
  const parsed = JSON.parse(message) as {
    to: { address: string }[];
    subject: string;
    text: string;
  };
  return {
    to: parsed.to.map((a) => a.address).join(','),
    subject: parsed.subject,
    text: parsed.text,
  };
}

describe('TransactionalMailService', () => {
  const VERIFY_URL = 'https://farzin.uz/api/v1/auth/verify-email?token=abc123';

  function withTransport(): {
    service: TransactionalMailService;
    sent: () => SentMail;
  } {
    const transport: Transporter<unknown> = createTransport({ jsonTransport: true });
    let last: unknown = null;
    const spy = jest
      .spyOn(transport, 'sendMail')
      .mockImplementation(async (options: unknown): Promise<unknown> => {
        // jsonTransport'ning haqiqiy xulqi saqlanadi, natija ushlab qolinadi.
        spy.mockRestore();
        last = await transport.sendMail(options as never);
        return last;
      });
    const service = new TransactionalMailService(transport, 'no-reply@farzin.uz');
    return {
      service,
      sent: (): SentMail => parseSent(last),
    };
  }

  it('SMTP sozlangan → enabled = true', () => {
    const { service } = withTransport();
    expect(service.enabled).toBe(true);
  });

  it('SMTP sozlanmagan (transport null) → enabled = false va send throw qiladi', async () => {
    const service = new TransactionalMailService(null, 'no-reply@farzin.uz');
    expect(service.enabled).toBe(false);

    // JIMGINA MUVAFFAQIYAT QAYTARMAYDI — aks holda xat ketmagani
    // sezilmay qolardi (provider-gating naqshi, billing Click pretsedenti).
    await expect(
      service.send({
        to: 'kimdir@test.uz',
        templateKey: 'auth.verify_email',
        locale: 'uz-Latn',
        payload: { verifyUrl: VERIFY_URL },
      }),
    ).rejects.toThrow(/SMTP sozlanmagan/);
  });

  it('email tasdiqlash xati YUBORILADI va tasdiqlash havolasini olib yuradi', async () => {
    const { service, sent } = withTransport();

    await service.send({
      to: 'yangi@test.uz',
      templateKey: 'auth.verify_email',
      locale: 'uz-Latn',
      payload: { verifyUrl: VERIFY_URL },
    });

    const mail = sent();
    expect(mail.to).toBe('yangi@test.uz');
    expect(mail.subject).toContain('tasdiqlang');
    // ENG MUHIM da'vo: havola xat ichida. Usiz xat foydasiz.
    expect(mail.text).toContain(VERIFY_URL);
    // Muddat ochiq aytilgan — foydalanuvchi nega havola o'lganini bilsin.
    expect(mail.text).toContain('24 soat');
  });

  it("foydalanuvchi tili qo'llanadi (ru)", async () => {
    const { service, sent } = withTransport();

    await service.send({
      to: 'ru@test.uz',
      templateKey: 'auth.verify_email',
      locale: 'ru',
      payload: { verifyUrl: VERIFY_URL },
    });

    const mail = sent();
    expect(mail.subject).toContain('подтвердите');
    expect(mail.text).toContain(VERIFY_URL);
  });

  it("noma'lum til → uz-Latn fallback (xat baribir ketadi)", async () => {
    const { service, sent } = withTransport();

    await service.send({
      to: 'de@test.uz',
      templateKey: 'auth.verify_email',
      locale: 'de-DE',
      payload: { verifyUrl: VERIFY_URL },
    });

    const mail = sent();
    expect(mail.subject).toContain('tasdiqlang');
  });
});
