import { BusinessRuleError } from '../errors/domain.error';

/**
 * Shaxmat soati — SOF matematik yadro.
 *
 * ═══════════════════════════════════════════════════════════════════════════
 *  SERVER-AUTHORITATIVE TAYMER (docs/07-realtime-and-clock.md §2, §3)
 *
 *  Bu modul VAQT MANBAINI BILMAYDI: `Date.now()` ham, `process.hrtime` ham
 *  chaqirilmaydi — `nowMs` har doim tashqaridan uzatiladi. Shu tufayli:
 *   - har bir funksiya deterministik (bir xil kirish → bir xil chiqish);
 *   - test soxta vaqt bilan millisekund aniqligida yuritiladi
 *     (docs/07 §13.1 FakeMonotonicClock g'oyasi).
 *
 *  Vaqt manbai haqidagi halol eslatma: docs/07 §3.3 nishon arxitekturada
 *  monotonic `process.hrtime.bigint()` + in-memory hot path talab qiladi.
 *  Birinchi bo'lakda (Faza 5 slice) soat holati Redis'da saqlanadi
 *  (docs/02-architecture.md §8.2 — ongli trade-off) va service qatlami
 *  wall-clock ms uzatadi. NTP orqaga sakrashi bu yerda `elapsed < 0 → 0`
 *  clamp bilan yutiladi — o'yinchi soat anomaliyasi uchun JAZOLANMAYDI
 *  (docs/07 §3.3 va §8.3 falsafasi: server nosozligi o'yinchi hisobiga emas).
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * Qo'llab-quvvatlanadigan turlar (docs/07 §3.1, prisma ClockType):
 *
 *  - SUDDEN_DEATH      — increment yo'q; vaqt tugasa flag.
 *  - FISCHER_INCREMENT — increment yurishdan KEYIN qo'shiladi; vaqt
 *                        to'planishi mumkin (boshlang'ichdan oshadi).
 *  - BRONSTEIN_DELAY   — sarflangan vaqt qaytariladi, lekin `delay` dan
 *                        ko'p emas: refund = min(elapsed, delay). Vaqt hech
 *                        qachon yurish boshidagi qiymatdan OSHMAYDI.
 *  - SIMPLE_DELAY      — har yurishda `delay` soniya soat yurmaydi, keyin
 *                        yura boshlaydi. docs/07 §3.1: "Simple delay
 *                        Bronstein bilan matematik ekvivalent natija beradi"
 *                        — hisob formulasi bir xil: charge = max(0,
 *                        elapsed − delay). Farq faqat displayda (`remaining`
 *                        funksiyasida aks etadi) va flag shartida.
 *  - MULTI_STAGE       — IMPLEMENTATSIYA QILINMAGAN. docs/07 §3.2 bo'yicha
 *                        multi-stage `TimeControlStage[]` konfiguratsiyasini
 *                        talab qiladi; `OnlineGame` jadvalida esa faqat
 *                        `baseTimeSeconds` + `incrementSeconds` bor —
 *                        bosqichlarni ifodalab bo'lmaydi. NOT_IMPLEMENTED
 *                        xatosi tashlanadi.
 */

export type ClockSide = 'w' | 'b';

/** prisma `ClockType` enum bilan aynan mos literal union (haqiqat manbai — schema). */
export type ChessClockType =
  'SUDDEN_DEATH' | 'FISCHER_INCREMENT' | 'BRONSTEIN_DELAY' | 'SIMPLE_DELAY' | 'MULTI_STAGE';

export interface ClockConfig {
  readonly clockType: ChessClockType;
  /** Boshlang'ich vaqt (ms), har bir tomon uchun. */
  readonly baseMs: number;
  /** Increment (Fischer) yoki delay (Bronstein/Simple) — ms. 0 = yo'q. */
  readonly incrementMs: number;
}

/**
 * Soat holati. Immutable — har o'tish YANGI obyekt qaytaradi.
 *
 * `lastEventAtMs` — joriy tomonning soati yurishni boshlagan payt
 * (oldingi yurish qabul qilingan payt).
 */
export interface ClockState {
  readonly whiteRemainingMs: number;
  readonly blackRemainingMs: number;
  /** Kimning soati yuryapti (navbat kimda). */
  readonly turn: ClockSide;
  readonly lastEventAtMs: number;
}

/** Yurish qabul qilinganda soat o'tishi natijasi. */
export type ApplyMoveResult =
  | {
      /** Yurish o'z vaqtida keldi — soat yangilandi, navbat almashdi. */
      readonly flagged: false;
      readonly state: ClockState;
      /** Shu yurishga o'tgan real vaqt (clamp'dan keyin) — thinkTimeMs manbai. */
      readonly elapsedMs: number;
    }
  | {
      /**
       * Vaqt TUGAGAN — yurish qabul qilinmaydi (docs/07 §5.2 6-qadam
       * `clock_expired`). `state` — yuruvchi tomon 0 ga clamp qilingan
       * yakuniy holat (TIMEOUT'da PostgreSQL'ga yoziladigan qiymat).
       */
      readonly flagged: true;
      readonly state: ClockState;
      readonly elapsedMs: number;
    };

/** MULTI_STAGE so'ralganda tashlanadigan xato — docs/07 §3.2 iqtibosi bilan. */
export function multiStageNotImplemented(): BusinessRuleError {
  return new BusinessRuleError(
    'CLOCK_TYPE_NOT_IMPLEMENTED',
    "MULTI_STAGE taymer hali qo'llab-quvvatlanmaydi: docs/07-realtime-and-clock.md " +
      "§3.2 bo'yicha u TimeControlStage[] konfiguratsiyasini talab qiladi, " +
      'OnlineGame jadvalida esa faqat baseTimeSeconds + incrementSeconds bor.',
    { clockType: 'MULTI_STAGE' },
  );
}

/** Ikkala tomon ham to'liq baza bilan boshlaydi; soat `turn` tomonda. */
export function createClock(config: ClockConfig, turn: ClockSide, nowMs: number): ClockState {
  assertSupported(config);
  return {
    whiteRemainingMs: config.baseMs,
    blackRemainingMs: config.baseMs,
    turn,
    lastEventAtMs: nowMs,
  };
}

/**
 * O'tgan vaqt — manfiy bo'lishi MUMKIN EMAS (NTP orqaga surilishi
 * o'yinchi foydasiga clamp qilinadi — docs/07 §3.3).
 */
function elapsedMs(state: ClockState, nowMs: number): number {
  return Math.max(0, nowMs - state.lastEventAtMs);
}

/**
 * Soatdan HAQIQATDA ayiriladigan vaqt.
 *
 * Bronstein/Simple delay: charge = max(0, elapsed − delay).
 * Bronstein uchun bu refund = min(elapsed, delay) bilan ayniyat:
 *   remaining − elapsed + min(elapsed, delay) ≡ remaining − max(0, elapsed − delay).
 * docs/07 §3.1 — "Simple delay Bronstein bilan matematik ekvivalent".
 */
function chargeableMs(config: ClockConfig, elapsed: number): number {
  switch (config.clockType) {
    case 'SUDDEN_DEATH':
    case 'FISCHER_INCREMENT':
      return elapsed;
    case 'BRONSTEIN_DELAY':
    case 'SIMPLE_DELAY':
      return Math.max(0, elapsed - config.incrementMs);
    case 'MULTI_STAGE':
      throw multiStageNotImplemented();
  }
}

function remainingOf(state: ClockState, side: ClockSide): number {
  return side === 'w' ? state.whiteRemainingMs : state.blackRemainingMs;
}

/**
 * Tomonning JONLI qolgan vaqti (`nowMs` paytida).
 *
 * Navbati bo'lmagan tomon uchun — saqlangan qiymat (soati yurmaydi).
 * Navbati bo'lgan tomon uchun — saqlangan qiymatdan chargeable ayiriladi.
 * Hech qachon manfiy emas — 0 da to'xtaydi.
 */
export function remaining(
  config: ClockConfig,
  state: ClockState,
  side: ClockSide,
  nowMs: number,
): number {
  const stored = remainingOf(state, side);
  if (side !== state.turn) {
    return stored;
  }
  return Math.max(0, stored - chargeableMs(config, elapsedMs(state, nowMs)));
}

/**
 * Flag sharti: chargeable o'tgan vaqt qolgan vaqtdan QAT'IY KATTA bo'lganda.
 * `elapsed === remaining` → hali flag EMAS (yurish aynan chegarada qabul
 * qilinadi, qolgan vaqt 0 bo'ladi) — "flag exactly when elapsed > remaining".
 */
export function isFlagged(config: ClockConfig, state: ClockState, nowMs: number): boolean {
  const stored = remainingOf(state, state.turn);
  return chargeableMs(config, elapsedMs(state, nowMs)) > stored;
}

/**
 * Yurish qabul qilindi — soat o'tishi.
 *
 * Tartib (docs/07 §3.1):
 *  1. elapsed o'lchanadi (clamp ≥ 0);
 *  2. chargeable ayiriladi;
 *  3. agar chargeable > remaining → FLAG (yurish rad, TIMEOUT);
 *  4. aks holda FISCHER_INCREMENT'da increment yurishdan KEYIN qo'shiladi
 *     (0.5s da yurgan o'yinchi 2s increment bilan 1.5s foyda ko'radi —
 *     bu Fischer'ning ta'rifi, §3.1 jadval);
 *  5. navbat raqibga o'tadi, `lastEventAtMs = nowMs`.
 */
export function applyMove(config: ClockConfig, state: ClockState, nowMs: number): ApplyMoveResult {
  assertSupported(config);
  const elapsed = elapsedMs(state, nowMs);
  const charge = chargeableMs(config, elapsed);
  const mover = state.turn;
  const stored = remainingOf(state, mover);

  if (charge > stored) {
    // Flag — yuruvchi tomon 0 ga clamp, navbat O'ZGARMAYDI (o'yin tugadi).
    return {
      flagged: true,
      elapsedMs: elapsed,
      state: withRemaining(state, mover, 0, state.lastEventAtMs),
    };
  }

  const increment = config.clockType === 'FISCHER_INCREMENT' ? config.incrementMs : 0;
  const nextRemaining = stored - charge + increment;

  return {
    flagged: false,
    elapsedMs: elapsed,
    state: {
      ...withRemaining(state, mover, nextRemaining, nowMs),
      turn: mover === 'w' ? 'b' : 'w',
    },
  };
}

function withRemaining(
  state: ClockState,
  side: ClockSide,
  value: number,
  lastEventAtMs: number,
): ClockState {
  return {
    whiteRemainingMs: side === 'w' ? value : state.whiteRemainingMs,
    blackRemainingMs: side === 'b' ? value : state.blackRemainingMs,
    turn: state.turn,
    lastEventAtMs,
  };
}

function assertSupported(config: ClockConfig): void {
  if (config.clockType === 'MULTI_STAGE') {
    throw multiStageNotImplemented();
  }
  if (!Number.isFinite(config.baseMs) || config.baseMs <= 0) {
    throw new BusinessRuleError('CLOCK_INVALID_BASE', "baseMs musbat chekli son bo'lishi shart", {
      baseMs: config.baseMs,
    });
  }
  if (!Number.isFinite(config.incrementMs) || config.incrementMs < 0) {
    throw new BusinessRuleError(
      'CLOCK_INVALID_INCREMENT',
      "incrementMs manfiy bo'lmagan chekli son bo'lishi shart",
      { incrementMs: config.incrementMs },
    );
  }
}
