import type { TournamentStatus } from './api';

/**
 * Formatlash — dizayn brifidagi lokal qoidalar
 * (design_prompts/farzin.md §2 "Users, market, locale").
 */

/**
 * Pul: `50 000 so'm`.
 *
 * ⚠️  Kirish TIYINDA va STRING (ADR-0006: pul hech qachon `number` emas —
 *     2^53 dan katta butun son yo'qoladi). Bo'linish faqat KO'RSATISH
 *     uchun, hisob-kitob uchun EMAS.
 *
 *     Dizayn brifi: "No `$`, no `₽`" va "never show fractional so'm".
 */
export function formatSom(amountTiyin: string | null): string {
  if (amountTiyin === null) {
    return 'Bepul';
  }
  let som: bigint;
  try {
    som = BigInt(amountTiyin) / 100n;
  } catch {
    return '—';
  }
  // Uch xonali guruh — ORALIQ bo'shliq bilan (nuqta yoki vergul emas).
  const grouped = som.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ' ');
  return `${grouped} so'm`;
}

/** Sana: `08.09.2026`. Turnir sanalari — kun aniqligida. */
export function formatDate(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) {
    return '—';
  }
  const dd = String(date.getUTCDate()).padStart(2, '0');
  const mm = String(date.getUTCMonth() + 1).padStart(2, '0');
  return `${dd}.${mm}.${String(date.getUTCFullYear())}`;
}

/** Sana oralig'i: bir kunlik turnirda ikkinchi sana takrorlanmaydi. */
export function formatDateRange(startIso: string, endIso: string): string {
  const start = formatDate(startIso);
  const end = formatDate(endIso);
  return start === end ? start : `${start} — ${end}`;
}

/**
 * Reyting: `1650 ± 45`.
 *
 * RD OCHIQ ko'rsatiladi — bu HALOLLIK qarori (docs/14 Faza 3):
 * "reyting nuqta emas, taqsimot". Uni yashirish foydalanuvchida
 * mavjud bo'lmagan aniqlik tuyg'usini yaratadi.
 */
export function formatRating(rating: number, deviation: number): string {
  return `${String(Math.round(rating))} ± ${String(Math.round(deviation))}`;
}

/** Vaqt nazorati: `90+30`, increment yo'q bo'lsa faqat `90`. */
/**
 * Vaqt nazorati — HAR DOIM `daqiqa+increment` ko'rinishida.
 *
 * ⚠️  Increment nol bo'lsa ham `+0` YOZILADI. Bu shaxmat
 *     konventsiyasi va dizayn brifi §5.10 aynan `5+0` ni ko'rsatadi.
 *     Ilgari nol tashlab yuborilardi va chip "Blits 5" deb chiqardi —
 *     o'yinchi uchun bu tugallanmagan ma'lumot: 5+0 mi, 5+3 mi?
 */
export function formatTimeControl(baseSeconds: number, incrementSeconds: number): string {
  const minutes = Math.round(baseSeconds / 60);
  return `${String(minutes)}+${String(incrementSeconds)}`;
}

export const TIME_CATEGORY_LABEL: Record<string, string> = {
  CLASSICAL: 'Klassik',
  RAPID: 'Rapid',
  BLITZ: 'Blits',
  BULLET: 'Bullet',
};

export const PAIRING_SYSTEM_LABEL: Record<string, string> = {
  SWISS_DUTCH: 'Shveytsar (FIDE Dutch)',
  ROUND_ROBIN: 'Doiraviy',
  DOUBLE_ROUND_ROBIN: 'Ikki doiraviy',
  KNOCKOUT: 'Nokaut',
  TEAM_SWISS: 'Jamoaviy shveytsar',
  SCHEVENINGEN: 'Sheveningen',
};

export interface StatusView {
  label: string;
  className: string;
}

/** Turnir holati — yorliq va nishon uslubi. */
export function statusView(status: TournamentStatus): StatusView {
  switch (status) {
    case 'REGISTRATION_OPEN':
      return { label: "Ro'yxat ochiq", className: 'badge badge-open' };
    case 'REGISTRATION_CLOSED':
      return { label: "Ro'yxat yopiq", className: 'badge' };
    case 'IN_PROGRESS':
      return { label: 'Davom etmoqda', className: 'badge badge-live' };
    case 'COMPLETED':
      return { label: 'Yakunlandi', className: 'badge badge-done' };
    case 'CANCELLED':
      return { label: 'Bekor qilindi', className: 'badge badge-cancelled' };
    case 'DRAFT':
      return { label: 'Qoralama', className: 'badge' };
  }
}

/**
 * Ismning bosh harflari — avatar o'rniga (rasm hali yo'q).
 *
 * Tartib "Familiya Ism" bilan BIR XIL: ro'yxatda ism qanday
 * ko'rinsa, doiradagi harflar ham shunday o'qiladi.
 */
export function initials(first: string | null, last: string | null): string {
  const a = (last ?? '').trim().charAt(0);
  const b = (first ?? '').trim().charAt(0);
  const text = `${a}${b}`.toUpperCase();
  // Ikkalasi ham bo'sh — savol belgisi, bo'sh doira emas.
  return text === '' ? '?' : text;
}

/** "Familiya Ism" — bo'sh maydonlar xavfsiz. */
export function fullName(first: string | null, last: string | null): string {
  const parts = [last, first].filter((p): p is string => p !== null && p.trim() !== '');
  return parts.length === 0 ? 'Noma`lum' : parts.join(' ');
}
