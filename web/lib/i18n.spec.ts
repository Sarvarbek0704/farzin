import { describe, expect, it } from 'vitest';

import {
  DEFAULT_LOCALE,
  LOCALES,
  LOCALE_LABEL,
  MESSAGE_KEYS,
  normalizeLocale,
  translate,
} from './i18n';

/**
 * Lug'at to'liqligi.
 *
 * ═══════════════════════════════════════════════════════════════════════════
 *  Backend'dagi `notification/templates.spec.ts` bilan AYNAN bir xil naqsh:
 *  har kalit × har til avtomatik tekshiriladi. Sabab bir xil — yangi matn
 *  qo'shilganda bitta tilni unutish JIMGINA o'tadi va foydalanuvchi
 *  ekranda bo'sh joy yoki begona til ko'radi.
 *
 *  Dizayn brifi §2 buni "hard constraint" deb ataydi: `uz-Latn` asosiy,
 *  almashtirgichda `uz-Cyrl`, `ru`, `en`.
 * ═══════════════════════════════════════════════════════════════════════════
 */

describe('lug`at to`liqligi', () => {
  it.each(MESSAGE_KEYS.flatMap((key) => LOCALES.map((locale) => [key, locale] as const)))(
    '%s × %s — bo`sh bo`lmagan matn',
    (key, locale) => {
      const value = translate(locale, key);
      expect(typeof value).toBe('string');
      expect(value.trim().length).toBeGreaterThan(0);
    },
  );

  it('kamida bitta kalit bor (lug`at bo`shab qolmasin)', () => {
    expect(MESSAGE_KEYS.length).toBeGreaterThan(20);
  });

  it('har til uchun o`z tilida yorliq bor', () => {
    // Almashtirgichda til HAR DOIM o'z tilida yoziladi — foydalanuvchi
    // tushunmaydigan tilda "Uzbek" deb yozish foydasiz.
    for (const locale of LOCALES) {
      expect(LOCALE_LABEL[locale].trim().length).toBeGreaterThan(0);
    }
    expect(LOCALE_LABEL['uz-Cyrl']).toBe('Ўзбекча');
    expect(LOCALE_LABEL.ru).toBe('Русский');
  });
});

/**
 * TEXNIK QISQARTMALAR — tarjima qilinMAYDI.
 *
 * Dizayn brifi §8: "Notation is sacred" — SAN/UCI/FEN hech qachon
 * tarjima qilinmaydi. `RD` (Rating Deviation) shu oilada: u Glicko-2
 * ning rasmiy belgisi va uni "РД" qilish o'quvchini chalg'itardi.
 *
 * Ro'yxat ATAYLAB qisqa va har qo'shimcha yozuv izoh talab qiladi:
 * bu — istisno, yumshatish emas.
 */
const TECHNICAL_KEYS = new Set(['table.deviation']);

describe('tarjima sifati', () => {
  it('kirill tillari HAQIQATAN kirill harflarida', () => {
    // Nusxa-ko'chirishda lotin matni kirill katagiga tushib qolishi —
    // eng ko'p uchraydigan xato. Kamida bitta kirill harfi bo'lsin.
    const cyrillic = /[Ѐ-ӿ]/;
    for (const key of MESSAGE_KEYS) {
      if (TECHNICAL_KEYS.has(key)) {
        continue;
      }
      expect(cyrillic.test(translate('uz-Cyrl', key)), `uz-Cyrl: ${key}`).toBe(true);
      expect(cyrillic.test(translate('ru', key)), `ru: ${key}`).toBe(true);
    }
  });

  it('texnik qisqartmalar ro`yxati KICHIK qoladi', () => {
    // Ro'yxat o'sib ketsa — bu tarjima qilinmagan matn yashiringan
    // degani. Chegara ataylab past.
    expect(TECHNICAL_KEYS.size).toBeLessThanOrEqual(3);
  });

  it('inglizcha matnda kirill YO`Q', () => {
    const cyrillic = /[Ѐ-ӿ]/;
    for (const key of MESSAGE_KEYS) {
      expect(cyrillic.test(translate('en', key)), `en: ${key}`).toBe(false);
    }
  });

  it('navigatsiya yorliqlari dizayn tizimidagi jadval bilan mos', () => {
    // Dizayn tizimi LOCALES jadvali — kanonik manba, o'ylab topilmagan.
    expect(translate('uz-Latn', 'nav.tournaments')).toBe('Turnirlar');
    expect(translate('uz-Cyrl', 'nav.tournaments')).toBe('Турнирлар');
    expect(translate('ru', 'nav.tournaments')).toBe('Турниры');
    expect(translate('en', 'nav.tournaments')).toBe('Tournaments');

    expect(translate('uz-Cyrl', 'nav.ratings')).toBe('Рейтинг');
    expect(translate('en', 'nav.ratings')).toBe('Ratings');
  });
});

describe('normalizeLocale', () => {
  it('qo`llab-quvvatlanadigan tilni o`zgartirmaydi', () => {
    expect(normalizeLocale('ru')).toBe('ru');
    expect(normalizeLocale('uz-Cyrl')).toBe('uz-Cyrl');
  });

  it('noma`lum til → uz-Latn (brifning asosiy tili)', () => {
    expect(normalizeLocale('de-DE')).toBe(DEFAULT_LOCALE);
    expect(normalizeLocale(undefined)).toBe(DEFAULT_LOCALE);
    expect(normalizeLocale('')).toBe(DEFAULT_LOCALE);
  });

  it('buzuq cookie qiymati ilovani YIQITMAYDI', () => {
    expect(normalizeLocale('<script>')).toBe(DEFAULT_LOCALE);
  });
});
