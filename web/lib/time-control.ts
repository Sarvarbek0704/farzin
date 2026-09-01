/**
 * Vaqt nazorati — presetlar va KATEGORIYA hisobi.
 *
 * ═══════════════════════════════════════════════════════════════════════════
 *  NEGA kategoriyani KLIENT emas, shu FUNKSIYA aniqlaydi
 *
 *  `timeCategory` — bezak emas, REYTING HOVUZINI tanlaydigan maydon:
 *  matchmaking.service.ts:161 aynan shu qiymat bilan
 *  `getCurrentRating(playerId, 'ONLINE', timeCategory)` chaqiradi va
 *  docs/06 §5 har kategoriya uchun ALOHIDA reyting saqlaydi.
 *
 *  Backend bu maydonni `baseTimeSeconds` bilan solishtirmaydi (topilma
 *  docs/AUDIT.md K-19). Ya'ni klient 30 daqiqalik o'yinni "BULLET" deb
 *  yuborsa, server qabul qiladi va bullet reytingi buziladi.
 *
 *  Shu sababli bu yerda kategoriya QO'LDA tanlanmaydi — vaqtdan
 *  hisoblanadi. Frontend nomuvofiqlikni O'ZI yaratmaydi; serverdagi
 *  tekshiruv esa alohida topilma sifatida yozilgan.
 * ═══════════════════════════════════════════════════════════════════════════
 */

export type TimeCategory = 'BULLET' | 'BLITZ' | 'RAPID' | 'CLASSICAL';

/**
 * FIDE Handbook: blits — 10 daqiqa va undan kam; rapid — 10 dan ko'p,
 * 60 dan kam; qolgani klassik. O'lchov `base + 60 x increment`
 * (bir o'yinchiga taxminiy umumiy vaqt).
 *
 * "Bullet" FIDE'da YO'Q — bu onlayn konventsiya (3 daqiqadan kam).
 * Chegara ochiq: 3+0 = 180s blits hisoblanadi, bullet emas.
 */
export function categoryFor(baseSeconds: number, incrementSeconds: number): TimeCategory {
  const total = baseSeconds + 60 * incrementSeconds;
  if (total < 180) return 'BULLET';
  if (total <= 600) return 'BLITZ';
  if (total < 3600) return 'RAPID';
  return 'CLASSICAL';
}

export interface TimeControlPreset {
  readonly baseSeconds: number;
  readonly incrementSeconds: number;
}

/**
 * Taklif etiladigan nazoratlar.
 *
 * ⚠️  Har qo'shimcha preset navbatni BO'LADI: matchmaking chelagi
 *     `(kategoriya, soat turi, base, increment)` bo'yicha aniq mos
 *     kelishni talab qiladi (matchmaking.service.ts:80 — poolKey).
 *     Ya'ni 3+2 va 3+1 BOSHQA navbat. Ro'yxat ataylab qisqa: kichik
 *     poolda ko'p variant = hech kim juftlashmaydi.
 */
export const PRESETS: readonly TimeControlPreset[] = [
  { baseSeconds: 60, incrementSeconds: 0 },
  { baseSeconds: 180, incrementSeconds: 0 },
  { baseSeconds: 180, incrementSeconds: 2 },
  { baseSeconds: 300, incrementSeconds: 0 },
  { baseSeconds: 600, incrementSeconds: 0 },
  { baseSeconds: 900, incrementSeconds: 10 },
];

/** `3+2` ko'rinishi — daqiqa + increment (soniya). */
export function presetLabel(preset: TimeControlPreset): string {
  const minutes = preset.baseSeconds / 60;
  // 1.5 daqiqa kabi holat presetlarda yo'q, lekin bo'lsa ham
  // "1.5+0" butun songa yaxlitlanib yolg'on ko'rsatmasin.
  const base = Number.isInteger(minutes) ? String(minutes) : minutes.toFixed(1);
  return `${base}+${String(preset.incrementSeconds)}`;
}

export const CATEGORY_LABEL: Record<TimeCategory, string> = {
  BULLET: 'Bullet',
  BLITZ: 'Blits',
  RAPID: 'Rapid',
  CLASSICAL: 'Klassik',
};
