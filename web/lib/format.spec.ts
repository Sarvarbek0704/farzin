import { describe, expect, it } from 'vitest';

import {
  formatDate,
  formatDateRange,
  formatRating,
  formatSom,
  formatTimeControl,
  fullName,
  initials,
  statusView,
} from './format';

/**
 * Formatlash — sof funksiyalar.
 *
 * ═══════════════════════════════════════════════════════════════════════════
 *  NEGA AYNAN BULAR TESTLANADI
 *
 *  Bu fayl foydalanuvchi KO'RADIGAN har bir raqamni yasaydi: pul, sana,
 *  reyting. Bu yerdagi jimgina xato (masalan tiyinni so'mga aylantirmay
 *  ko'rsatish) ekranda 100 baravar katta narx chiqaradi va uni hech
 *  qanday backend testi ushlamaydi.
 *
 *  docs/AUDIT.md da "frontend uchun test yo'q" deb qayd etilgan edi —
 *  bu shu bo'shliqning birinchi qismi.
 * ═══════════════════════════════════════════════════════════════════════════
 */

describe('formatSom', () => {
  it("tiyinni so'mga aylantiradi va uch xonali guruhlaydi", () => {
    // 5 000 000 tiyin = 50 000 so'm. Dizayn brifi: bo'shliq bilan
    // guruhlanadi, nuqta yoki vergul bilan EMAS.
    expect(formatSom('5000000')).toBe("50 000 so'm");
  });

  it('guruh ajratgichi UZILMAS bo`shliq (U+00A0)', () => {
    // Oddiy bo'shliq bo'lsa "50" va "000" qator oxirida AJRALIB
    // ketishi mumkin — narx ikkiga bo'linib ko'rinardi. Bu ataylab.
    const value = formatSom('5000000');
    expect(value).toContain(' ');
    expect(value).not.toContain('50 000');
  });

  it('kichik summa ham to`g`ri', () => {
    expect(formatSom('100')).toBe("1 so'm");
  });

  it('katta summa — Number aniqligidan tashqarida ham to`g`ri', () => {
    // ADR-0006 ning sababi: `Number` 2^53 dan katta butun sonni
    // yo'qotadi. BigInt bilan hisoblanadi.
    expect(formatSom('9007199254740993000')).toBe("90 071 992 547 409 930 so'm");
  });

  it('null → "Bepul" (nol EMAS)', () => {
    // Start puli yo'qligi — "0 so'm" emas, "bepul". Bular boshqa narsa.
    expect(formatSom(null)).toBe('Bepul');
  });

  it('buzuq qiymatda YIQILMAYDI', () => {
    // Sahifa bitta xato maydon tufayli oq ekran bo'lib qolmasin.
    expect(formatSom('salom')).toBe('—');
  });
});

describe('formatDate / formatDateRange', () => {
  it('ISO sanani kun.oy.yil ko`rinishida beradi', () => {
    expect(formatDate('2026-09-08T00:00:00.000Z')).toBe('08.09.2026');
  });

  it('buzuq sana YIQILMAYDI', () => {
    expect(formatDate('umuman-sana-emas')).toBe('—');
  });

  it('bir kunlik turnirda sana TAKRORLANMAYDI', () => {
    const day = '2026-09-08T00:00:00.000Z';
    expect(formatDateRange(day, day)).toBe('08.09.2026');
  });

  it('ko`p kunlik turnirda oraliq ko`rsatiladi', () => {
    expect(formatDateRange('2026-09-08T00:00:00.000Z', '2026-09-10T00:00:00.000Z')).toBe(
      '08.09.2026 — 10.09.2026',
    );
  });
});

describe('formatRating', () => {
  it('RD ni OCHIQ ko`rsatadi — "1650 ± 45"', () => {
    // docs/14 Faza 3 halollik qarori: reyting nuqta emas, taqsimot.
    // RD ni yashirish mavjud bo'lmagan aniqlik tuyg'usini yaratadi.
    expect(formatRating(1650.4, 45.2)).toBe('1650 ± 45');
  });

  it('yaxlitlaydi — kasr xonalar ekranda ma`nosiz', () => {
    expect(formatRating(1716.3884, 193.5343)).toBe('1716 ± 194');
  });
});

describe('formatTimeControl', () => {
  it('increment bilan: 90+30', () => {
    expect(formatTimeControl(5400, 30)).toBe('90+30');
  });

  it('increment nol bo`lsa ham +0 YOZILADI (brif §5.10)', () => {
    // "15" tugallanmagan ma'lumot: o'yinchi 15+0 mi, 15+10 mi bilmaydi.
    expect(formatTimeControl(900, 0)).toBe('15+0');
    expect(formatTimeControl(300, 0)).toBe('5+0');
  });
});

describe('statusView', () => {
  it('har holat uchun yorliq va nishon sinfini beradi', () => {
    expect(statusView('IN_PROGRESS')).toEqual({
      label: 'Davom etmoqda',
      className: 'badge badge-live',
    });
    expect(statusView('REGISTRATION_OPEN').label).toBe("Ro'yxat ochiq");
    expect(statusView('CANCELLED').className).toContain('cancelled');
  });
});

describe('fullName', () => {
  it('"Familiya Ism" tartibida', () => {
    expect(fullName('Nodirbek', 'Abdusattorov')).toBe('Abdusattorov Nodirbek');
  });

  it('bo`sh maydonlar tashlab ketiladi', () => {
    expect(fullName(null, 'Abdusattorov')).toBe('Abdusattorov');
  });

  it('ikkalasi ham yo`q bo`lsa ham YIQILMAYDI', () => {
    expect(fullName(null, null)).toBe('Noma`lum');
  });
});

describe('initials', () => {
  it('familiya + ism bosh harflari — ko`rsatish tartibida', () => {
    expect(initials('Nodirbek', 'Abdusattorov')).toBe('AN');
  });

  it('bitta maydon bo`lsa bitta harf', () => {
    expect(initials(null, 'Abdusattorov')).toBe('A');
    expect(initials('Nodirbek', null)).toBe('N');
  });

  it('ikkalasi ham bo`sh — savol belgisi, BO`SH doira emas', () => {
    // Bo'sh doira "yuklanmoqda" degan taassurot berardi.
    expect(initials(null, null)).toBe('?');
    expect(initials('   ', '')).toBe('?');
  });

  it('doim BOSH harf', () => {
    expect(initials('javokhir', 'sindarov')).toBe('SJ');
  });
});
