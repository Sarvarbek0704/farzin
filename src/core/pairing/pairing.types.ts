/**
 * Juftlashtirish dvigateli — tiplar.
 *
 * Bu fayl sof TypeScript. NestJS, Prisma, HTTP — hech biri bilinmaydi (ADR-0001).
 * Sabab: juftlashtirish algoritmi loyihaning eng qimmatli va eng uzoq
 * yashaydigan qismi. Uni test qilish uchun DB ko'tarish shart emas.
 *
 * @see docs/05-pairing-engine.md
 * @see docs/adr/0007-blossom-matching-for-pairing.md
 */

export type PlayerId = string & { readonly __brand: 'PlayerId' };
export type RoundId = string & { readonly __brand: 'RoundId' };

export enum Color {
  White = 'WHITE',
  Black = 'BLACK',
}

/**
 * Rang afzalligi kuchi (FIDE C.04.3, colour allocation).
 *
 * - Absolute: buzib bo'lmaydi (|CD| = 2 yoki ketma-ket 2 marta bir xil rang)
 * - Strong:   |CD| = 1
 * - Mild:     CD = 0, lekin oxirgi rang qarama-qarshi bo'lishi kerak
 * - None:     hali o'ynamagan
 */
export enum ColorPreferenceStrength {
  Absolute = 'ABSOLUTE',
  Strong = 'STRONG',
  Mild = 'MILD',
  None = 'NONE',
}

export interface ColorPreference {
  readonly color: Color | null;
  readonly strength: ColorPreferenceStrength;
}

export enum FloatDirection {
  None = 'NONE',
  Down = 'DOWN',
  Up = 'UP',
}

export enum ByeType {
  /** Juftliksiz qolgan o'yinchiga beriladigan bye. Odatda 1 ochko. */
  PairingAllocated = 'PAIRING_ALLOCATED',
  /** O'yinchi oldindan so'ragan bye. Odatda 0.5 ochko. */
  Requested = 'REQUESTED',
  /** Kelmagan o'yinchi. 0 ochko. */
  ZeroPoint = 'ZERO_POINT',
}

/**
 * Juftlashtirish uchun bir o'yinchining to'liq holati.
 *
 * MUHIM: `rating` bu yerda — ro'yxatga olishdagi MUZLATILGAN reyting
 * (`Registration.ratingAtEntry`), joriy reyting emas.
 *
 * Sabab: o'yinchi turnir davomida boshqa turnirda o'ynab reytingi
 * o'zgarishi mumkin. Agar joriy reyting ishlatilsa, 3-turdagi
 * juftlashtirishni qayta hisoblaganda BOSHQACHA natija chiqadi —
 * determinizm buziladi va hakam apellyatsiyasida javob berib bo'lmaydi.
 *
 * @see docs/03-data-model.md §3.1
 */
export interface PlayerPairingState {
  readonly playerId: PlayerId;

  /**
   * Juftlashtirish raqami (pairing number).
   * Turnir boshida reyting bo'yicha beriladi va TURNIR DAVOMIDA O'ZGARMAYDI.
   */
  readonly pairingNumber: number;

  /** Ro'yxatga olishdagi reyting. Muzlatilgan. */
  readonly rating: number;

  /** Joriy ochko. 0.5 qadam bilan (Decimal → number, chunki qiymatlar kichik va aniq). */
  readonly points: number;

  /** Bu o'yinchi bilan allaqachon o'ynagan raqiblar. FIDE C1: ikki marta uchrashmaydi. */
  readonly opponentIds: ReadonlySet<PlayerId>;

  /** Rang tarixi, tur tartibida. Bye bo'lgan turda element YO'Q. */
  readonly colorHistory: readonly Color[];

  /** Float tarixi, tur tartibida. */
  readonly floatHistory: readonly FloatDirection[];

  /** Allaqachon bye olganmi (odatda bir o'yinchi bir marta oladi). */
  readonly hasReceivedBye: boolean;

  /** Turnirdan chiqqanmi. Chiqqan o'yinchi juftlashtirilmaydi. */
  readonly isWithdrawn: boolean;

  /** Qaysi turdan boshlab o'ynayapti (kech qo'shilgan o'yinchi uchun). */
  readonly joinedAtRound: number;
}

export interface PairingRequest {
  readonly roundId: RoundId;
  readonly roundNumber: number;
  readonly totalRounds: number;
  readonly players: readonly PlayerPairingState[];

  /**
   * Determinizm uchun urug' (seed).
   *
   * Algoritm tasodifiylik ishlatmasligi kerak. Lekin teng og'irlikdagi
   * variantlar orasidan tanlash uchun barqaror tartib kerak — u
   * pairingNumber bo'yicha stable sort bilan hal qilinadi.
   *
   * Bu maydon faqat kelajakdagi variantlar uchun zaxira. Hozircha
   * implementatsiya uni E'TIBORSIZ qoldirishi kerak.
   */
  readonly seed?: number;
}

export interface Pairing {
  readonly boardNumber: number;
  readonly whitePlayerId: PlayerId;
  readonly blackPlayerId: PlayerId;
}

export interface ByeAssignment {
  readonly playerId: PlayerId;
  readonly type: ByeType;
  readonly points: number;
}

export interface PairingResult {
  readonly pairings: readonly Pairing[];
  readonly byes: readonly ByeAssignment[];

  /**
   * Algoritm versiyasi. `Round.pairingEngineVersion` ga yoziladi.
   *
   * Nega: algoritm o'zgarsa, eski turnirlarning juftlashtirishini
   * qayta hisoblash BOSHQACHA natija berishi mumkin. Versiya bu
   * farqni tushuntiradi. Audit uchun majburiy.
   */
  readonly engineVersion: string;

  /** Diagnostika — hakam "nega bu juftlik?" deb so'raganda. */
  readonly diagnostics?: PairingDiagnostics;
}

export interface PairingDiagnostics {
  readonly durationMs: number;
  readonly scoreGroupCount: number;
  readonly floatCount: number;
  /** Buzilgan sifat kriteriylari (C6–C21). Absolyut kriteriy buzilsa — xato tashlanadi. */
  readonly relaxedCriteria: readonly string[];
}

/**
 * Juftlashtirish imkonsiz.
 *
 * Bu KUTILGAN holat, bug emas. Masalan: 3 o'yinchi qolgan va
 * ularning hammasi bir-biri bilan allaqachon o'ynagan.
 *
 * Hakam qo'lda aralashishi kerak.
 */
export class PairingImpossibleError extends Error {
  readonly code = 'PAIRING_IMPOSSIBLE';

  constructor(
    readonly roundId: RoundId,
    readonly reason: string,
  ) {
    super(`Round ${roundId} uchun juftlashtirish imkonsiz: ${reason}`);
    this.name = 'PairingImpossibleError';
    Object.setPrototypeOf(this, PairingImpossibleError.prototype);
  }
}

/**
 * Juftlashtirish dvigateli — port.
 *
 * Strategiya pattern: har bir tizim (Swiss, round-robin, knockout)
 * uchun alohida implementatsiya.
 *
 * KAFOLATLAR (har bir implementatsiya bajarishi SHART):
 *
 *  1. DETERMINIZM — bir xil input → bir xil output. Har doim, har platformada.
 *     `Math.random()`, `Date.now()`, `Set` iteratsiya tartibiga bog'liqlik — TAQIQLANADI.
 *
 *  2. Hech bir o'yinchi ikki marta juftlashtirilmaydi.
 *
 *  3. Hech bir juftlik takrorlanmaydi (FIDE C1).
 *
 *  4. Har bir chiqmagan o'yinchi juftlashtiriladi yoki bye oladi.
 *
 * Bu kafolatlar property-based test bilan tekshiriladi.
 *
 * @see docs/05-pairing-engine.md §7
 */
export interface PairingEngine {
  readonly system: string;
  readonly version: string;

  /**
   * @throws {PairingImpossibleError} yaroqli juftlashtirish topilmasa
   */
  pair(request: PairingRequest): Promise<PairingResult>;
}
