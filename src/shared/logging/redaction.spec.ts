import { Writable } from 'node:stream';

import pino from 'pino';

import { REDACTION_CENSOR, redactionConfig } from './redaction';

/**
 * Log redaksiyasi — HAQIQIY pino bilan, xotiradagi oqimga yozib.
 *
 * ═══════════════════════════════════════════════════════════════════════════
 *  BU TEST QAYSI TZ BANDINI YOPADI (docs/14-roadmap.md)
 *
 *   Faza 0 DoD: "Log'da parol/token YO'QLIGI test bilan tasdiqlangan"
 *   Faza 4 DoD: "Log'da karta ma'lumoti yo'qligi test bilan tasdiqlangan"
 *
 *  Auditgacha redaksiya KONFIGURATSIYASI bor edi, lekin uni HECH KIM
 *  tekshirmasdi (docs/AUDIT.md: "Bunday test yo'q"). Konfiguratsiya
 *  "to'g'ri ko'rinishi" — isbot emas: pino `redact.paths` ANIQ yo'llarni
 *  talab qiladi va bitta xato yo'l jimgina sirni log'ga chiqarardi.
 *
 *  Shuning uchun bu yerda mock YO'Q: haqiqiy pino instansiyasi quriladi,
 *  chiqish xotirada ushlanadi va SIR MATNI bor-yo'qligi tekshiriladi.
 * ═══════════════════════════════════════════════════════════════════════════
 */

/** Pino chiqishini xotirada ushlab turuvchi oqim. */
function captureStream(): { stream: Writable; lines: () => string[] } {
  const chunks: string[] = [];
  const stream = new Writable({
    write(chunk: Buffer, _encoding, callback): void {
      chunks.push(chunk.toString('utf8'));
      callback();
    },
  });
  return {
    stream,
    lines: (): string[] => chunks.join('').split('\n').filter(Boolean),
  };
}

describe('log redaksiyasi (haqiqiy pino)', () => {
  const PASSWORD = 'juda-maxfiy-parol-2026';
  const REFRESH = 'xom-refresh-token-abcdef123456';
  const BEARER = 'Bearer eyJhbGciOiJIUzI1NiJ9.soxta.imzo';
  const COOKIE = 'farzin_rt=xom-cookie-qiymati-987654';
  const CARD = '8600123412341234';
  const CVV = '123';

  /** Har testda toza logger + oqim. */
  function logger(): { log: pino.Logger; output: () => string } {
    const { stream, lines } = captureStream();
    const log = pino({ redact: redactionConfig(), level: 'info' }, stream);
    return { log, output: (): string => lines().join('\n') };
  }

  it('parol va parol maydonlari log`ga TUSHMAYDI', () => {
    const { log, output } = logger();

    log.info({
      req: {
        body: {
          password: PASSWORD,
          currentPassword: PASSWORD,
          newPassword: PASSWORD,
          passwordHash: '$argon2id$v=19$m=19456,t=2,p=1$soxta',
        },
      },
    });

    const out = output();
    expect(out).not.toContain(PASSWORD);
    expect(out).not.toContain('$argon2id$');
    expect(out).toContain(REDACTION_CENSOR);
  });

  it('token va sessiya sirlari log`ga TUSHMAYDI', () => {
    const { log, output } = logger();

    log.info({
      req: {
        headers: { authorization: BEARER, cookie: COOKIE },
        body: { refreshToken: REFRESH, token: REFRESH, totpCode: '123456' },
      },
      res: { headers: { 'set-cookie': [COOKIE] } },
    });

    const out = output();
    expect(out).not.toContain(BEARER);
    expect(out).not.toContain(COOKIE);
    expect(out).not.toContain(REFRESH);
    expect(out).not.toContain('123456');
  });

  it('KARTA ma`lumoti log`ga TUSHMAYDI (Faza 4 DoD)', () => {
    // Karta Farzin serverida saqlanmaydi (provayder tokenizatsiyasi),
    // lekin webhook body'sini provayder to'ldiradi va u autoLogging
    // bilan loglanadi — himoya chuqurlikda.
    const { log, output } = logger();

    log.info({
      req: {
        body: {
          cardNumber: CARD,
          card_number: CARD,
          pan: CARD,
          cvv: CVV,
          cvc: CVV,
          expiry: '12/28',
          card: { number: CARD },
        },
      },
    });

    const out = output();
    expect(out).not.toContain(CARD);
    expect(out).not.toContain('12/28');
    expect(out).toContain(REDACTION_CENSOR);
  });

  it('SIR BO`LMAGAN maydonlar saqlanadi — redaksiya haddan oshmaydi', () => {
    // Teskari tekshiruv: hamma narsani yashirsak log foydasiz bo'lardi.
    const { log, output } = logger();

    log.info({
      req: {
        method: 'POST',
        url: '/api/v1/auth/login',
        headers: { 'user-agent': 'farzin-test' },
        body: { email: 'kimdir@test.uz' },
      },
    });

    const out = output();
    expect(out).toContain('/api/v1/auth/login');
    expect(out).toContain('kimdir@test.uz');
    expect(out).toContain('farzin-test');
  });

  it('yo`l ro`yxati bo`sh emas va TOKEN/PAROL kalitlarini qamrab oladi', () => {
    // Regressiya qorovuli: kimdir ro'yxatni qisqartirsa yiqiladi.
    const paths = redactionConfig().paths;
    expect(paths.length).toBeGreaterThanOrEqual(15);
    for (const required of [
      'req.headers.authorization',
      'req.headers.cookie',
      'req.body.password',
      'req.body.refreshToken',
      'res.headers["set-cookie"]',
    ]) {
      expect(paths).toContain(required);
    }
  });
});
