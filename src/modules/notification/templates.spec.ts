import { NOTIFICATION_LOCALES, TEMPLATE_KEYS } from './notification.types';
import { formatAmountTiyin, normalizeLocale, renderTemplate } from './templates';

/**
 * Shablon registry — sof funksiyalar (templates.ts).
 *
 * Da'volar: (1) HAR kalit × HAR til bo'sh bo'lmagan subject/body beradi;
 * (2) noma'lum til uz-Latn'ga tushadi (fallback); (3) noma'lum kalit null;
 * (4) pul formatlash buzuq kirishda ham yiqilmaydi (xabar chiqmay
 * qolishidan ko'ra xunuk chiqqani yaxshi — templates.ts izohi).
 */
describe('notification templates', () => {
  /** Barcha kalitlar uchun yetarli namunaviy payload. */
  const payload: Record<string, unknown> = {
    roundNumber: 3,
    sectionId: '019-section',
    sectionName: 'A guruh',
    tournamentName: 'Toshkent rapid 2026',
    invoiceId: '019-invoice',
    invoiceNumber: 'FRZ-2026-000001',
    amountTiyin: '5000000',
    currency: 'UZS',
    reason: 'Turnir bekor qilindi',
    caseId: '019-case',
    gameId: '019-game',
    status: 'CHECKMATE',
    verifyUrl: 'https://farzin.uz/api/v1/auth/verify-email?token=abc123',
    resetUrl: 'https://farzin.uz/parolni-tiklash?token=xyz789',
  };

  it.each(
    TEMPLATE_KEYS.flatMap((key) => NOTIFICATION_LOCALES.map((locale) => [key, locale] as const)),
  )("%s × %s — bo'sh bo'lmagan subject/body", (key, locale) => {
    const rendered = renderTemplate(key, locale, payload);
    expect(rendered).not.toBeNull();
    expect(rendered!.subject.trim().length).toBeGreaterThan(0);
    expect(rendered!.body.trim().length).toBeGreaterThan(0);
  });

  it("noma'lum til → uz-Latn fallback", () => {
    for (const key of TEMPLATE_KEYS) {
      expect(renderTemplate(key, 'de-DE', payload)).toEqual(
        renderTemplate(key, 'uz-Latn', payload),
      );
    }
  });

  it("noma'lum kalit → null (throw emas)", () => {
    expect(renderTemplate('no.such.key', 'uz-Latn', payload)).toBeNull();
  });

  it("payload maydoni yo'q bo'lsa ham render yiqilmaydi", () => {
    for (const key of TEMPLATE_KEYS) {
      const rendered = renderTemplate(key, 'ru', {});
      expect(rendered).not.toBeNull();
      expect(rendered!.body.length).toBeGreaterThan(0);
    }
  });

  it('tur raqami va turnir nomi round.completed matnida bor', () => {
    const rendered = renderTemplate('round.completed', 'uz-Latn', payload)!;
    expect(rendered.subject).toContain('3');
    expect(rendered.body).toContain('Toshkent rapid 2026');
    expect(rendered.body).toContain('A guruh');
  });

  it('invoys raqami payment.completed matnida bor (har tilda)', () => {
    for (const locale of NOTIFICATION_LOCALES) {
      const rendered = renderTemplate('payment.completed', locale, payload)!;
      expect(rendered.body).toContain('FRZ-2026-000001');
    }
  });

  describe('normalizeLocale', () => {
    it("qo'llab-quvvatlanadigan tillar o'zgarmaydi", () => {
      for (const locale of NOTIFICATION_LOCALES) {
        expect(normalizeLocale(locale)).toBe(locale);
      }
    });

    it('boshqa hamma narsa → uz-Latn', () => {
      expect(normalizeLocale('fr')).toBe('uz-Latn');
      expect(normalizeLocale('')).toBe('uz-Latn');
      expect(normalizeLocale('UZ-LATN')).toBe('uz-Latn');
    });
  });

  describe('formatAmountTiyin', () => {
    it("to'g'ri UZS summa — bo'sh emas va xom tiyin emas", () => {
      const formatted = formatAmountTiyin('5000000', 'UZS', 'en');
      expect(formatted.length).toBeGreaterThan(0);
      // 5 000 000 tiyin = 50 000 so'm — natijada tiyin soni ko'rinmaydi.
      expect(formatted).not.toContain('5000000');
    });

    it('buzuq summa → xom fallback (throw emas)', () => {
      expect(formatAmountTiyin('bu-son-emas', 'UZS', 'uz-Latn')).toBe('bu-son-emas UZS');
    });

    it("noma'lum valyuta → xom fallback", () => {
      expect(formatAmountTiyin('100', 'BTC', 'ru')).toBe('100 BTC');
    });

    it("umuman yo'q qiymatlar → placeholder", () => {
      expect(formatAmountTiyin(undefined, undefined, 'en')).toBe('? ?');
    });
  });
});
