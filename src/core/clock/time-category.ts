/**
 * Reyting kategoriyasi. Bu yerda ATAYLAB qayta e'lon qilinadi:
 * `src/core/` modullardan hech narsa import qilmaydi (dependency-cruiser
 * `core-must-stay-pure`). Prisma `TimeCategory` enum'i bilan bir xil
 * bo'lishi `play.types.ts` da tekshiriladi.
 */
export type TimeCategory = 'CLASSICAL' | 'RAPID' | 'BLITZ' | 'BULLET';

/**
 * Vaqt nazoratidan REYTING KATEGORIYASINI aniqlash — sof funksiya.
 *
 * ═══════════════════════════════════════════════════════════════════════════
 *  NEGA BU SERVERDA HISOBLANADI, KLIENTDAN QABUL QILINMAYDI
 *
 *  `timeCategory` bezak emas: aynan u reyting hovuzini tanlaydi
 *  (`matchmaking.service.ts` → `getCurrentRating(playerId, 'ONLINE',
 *  timeCategory)`), docs/06 §5 esa har kategoriya uchun MUSTAQIL
 *  `r`, `RD`, `σ` uchligini saqlaydi.
 *
 *  Agar bu qiymat klientdan so'roqsiz olinsa, 30 daqiqalik o'yinni
 *  "BULLET" deb yuborib bullet reytingini o'ynab olish mumkin bo'lardi —
 *  ya'ni kategoriyalarni ajratishning butun ma'nosi yo'qolardi
 *  (docs/AUDIT.md K-19).
 * ═══════════════════════════════════════════════════════════════════════════
 *
 *  Formula — docs/06 §5.1:
 *
 *      effective_minutes = base_minutes + increment_seconds
 *
 *  FIDE'ning "o'rtacha o'yin ~60 yurish" taxminiga asoslangan: har
 *  yurishga qo'shiladigan `inc` soniya 60 yurishda `inc` daqiqa beradi.
 *
 *  ⚠️  Chegaralar ONLAYN uchun (docs/06 §5 jadvali, ONLINE qatorlari).
 *      OTB chegaralari BOSHQA — u yerda klassik ≥ 60 daqiqa, onlaynda
 *      esa ≥ 30. Shu sababli funksiya nomi ataylab `online...` bilan
 *      boshlanadi: OTB uchun ishlatib yuborilmasin.
 *
 *  Chegaralarning ochiq/yopiqligi FIDE konvensiyasiga ergashadi:
 *  blits "10 daqiqa VA UNDAN KAM", ya'ni 10 — hali blits.
 */
export function onlineTimeCategory(
  baseTimeSeconds: number,
  incrementSeconds: number,
): TimeCategory {
  const effectiveMinutes = baseTimeSeconds / 60 + incrementSeconds;

  if (effectiveMinutes < 3) {
    return 'BULLET';
  }
  if (effectiveMinutes <= 10) {
    return 'BLITZ';
  }
  if (effectiveMinutes < 30) {
    return 'RAPID';
  }
  return 'CLASSICAL';
}
