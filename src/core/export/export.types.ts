/**
 * Eksport yozuvchilari (PGN, TRF16) — kirish tiplari.
 *
 * Bu fayl sof TypeScript. NestJS, Prisma, HTTP — hech biri bilinmaydi
 * (ADR-0001, `core-must-stay-pure`). Prisma qatorlaridan bu shaklga
 * o'tkazish arbiter modulida bajariladi — yozuvchilar DB sxemasini emas,
 * shu kontraktni biladi.
 *
 * Maqsad: docs/14-roadmap.md Faza 1 "Eksport" — "PGN eksport (turnir,
 * raund, o'yin)" va "Chess-Results formatiga eksport (migratsiya yo'li)".
 * TRF(x) tanlovi docs/05-pairing-engine.md §8.3 da asoslangan: golden
 * test uchun ham, eksport uchun ham bitta format.
 */

/**
 * Juftlik natijasi — `prisma/schema.prisma` `PairingResult` enum'i bilan
 * AYNAN mos literal'lar (arbiter.types.ts `PAIRING_RESULTS` uslubi:
 * core Prisma'ni import qila olmaydi, chegarada strukturaviy mos keladi).
 */
export type ExportPairingResult =
  | 'WHITE_WIN'
  | 'BLACK_WIN'
  | 'DRAW'
  | 'WHITE_WIN_FORFEIT'
  | 'BLACK_WIN_FORFEIT'
  | 'DOUBLE_FORFEIT'
  | 'BYE_FULL'
  | 'BYE_HALF'
  | 'BYE_ZERO'
  | 'UNPLAYED';

/**
 * Bitta ishtirokchi — TRF 001-qator va PGN teglar uchun kerak bo'lgan
 * hamma narsa. Sana/matn maydonlari oddiy string: core `Date` bilan
 * timezone o'yinlariga kirmaydi (Asia/Tashkent formatlash — modul
 * qatlamining ishi).
 */
export interface ExportPlayer {
  /** Juftliklardagi white/blackRegistrationId bilan bog'lash kaliti. */
  readonly registrationId: string;
  /** Boshlang'ich raqam (Registration.pairingNumber) — TRF start rank. */
  readonly startRank: number;
  readonly lastName: string;
  readonly firstName: string;
  /** null — ko'rsatilmagan (TRF jins ustuni bo'sh qoladi). */
  readonly gender: 'MALE' | 'FEMALE' | null;
  /** FIDE unvoni (GM/IM/FM/CM/WGM/WIM/WFM/WCM) yoki milliy NM; null — yo'q. */
  readonly title: string | null;
  /** Muzlatilgan reyting (Registration.ratingAtEntry); null — reytingsiz. */
  readonly rating: number | null;
  /** FIDE federatsiya kodi (masalan "UZB"); null — noma'lum. */
  readonly federation: string | null;
  readonly fideId: string | null;
  /** Tug'ilgan sana ISO ko'rinishda: "YYYY-MM-DD"; null — noma'lum. */
  readonly birthDate: string | null;
  /** Jadvaldagi ochko (Standing.points); jadval hali yo'q bo'lsa 0. */
  readonly points: number;
  /** Jadvaldagi o'rin; null — hali hisoblanmagan. */
  readonly rank: number | null;
}

/** Bitta juftlik (taxta). `blackRegistrationId = null` — bye. */
export interface ExportPairing {
  readonly boardNumber: number;
  readonly whiteRegistrationId: string;
  readonly blackRegistrationId: string | null;
  readonly result: ExportPairingResult;
  /** Saqlangan partiya yozuvi (Pairing.pgn) — xom movetext; null — yo'q. */
  readonly pgn: string | null;
}

/** Bitta tur. `date` — ISO "YYYY-MM-DD"; null — rejalashtirilmagan. */
export interface ExportRound {
  readonly number: number;
  readonly date: string | null;
  readonly pairings: readonly ExportPairing[];
}

/**
 * Seksiya eksporti uchun to'liq ma'lumot to'plami — ikkala yozuvchining
 * (pgn-writer, trf-writer) yagona kirishi.
 */
export interface SectionExportData {
  readonly tournamentName: string;
  readonly sectionName: string;
  /**
   * PGN `Site` tegi uchun tayyor qiymat, PGN standarti tavsiyasidagi
   * "City, Region COUNTRY" ruhida (masalan "Shaxmat saroyi, Tashkent UZB");
   * null — noma'lum → "?".
   */
  readonly site: string | null;
  /** TRF 022 (shahar); null — noma'lum. */
  readonly city: string | null;
  /** TRF 032 (tashkil etuvchi federatsiya, masalan "UZB"); null — noma'lum. */
  readonly federation: string | null;
  /** Turnir boshlanish sanasi ISO "YYYY-MM-DD"; null — noma'lum. */
  readonly startDate: string | null;
  /** Turnir tugash sanasi ISO "YYYY-MM-DD"; null — noma'lum. */
  readonly endDate: string | null;
  /** TRF 092 (turnir turi, masalan "Individual: Round-Robin"); null — noma'lum. */
  readonly tournamentType: string | null;
  /** TRF 102 (bosh hakam); null — ko'rsatilmagan → qator yozilmaydi. */
  readonly chiefArbiter: string | null;
  /** startRank bo'yicha o'sish tartibida berilishi shart emas — yozuvchilar o'zi saralaydi. */
  readonly players: readonly ExportPlayer[];
  /** Tur raqami bo'yicha berilishi shart emas — yozuvchilar o'zi saralaydi. */
  readonly rounds: readonly ExportRound[];
}
