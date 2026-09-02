import type { ClockSide, ClockState } from '../../core/clock/chess-clock';

/**
 * Play moduli — PUBLIC tiplar.
 *
 * prisma/schema.prisma enum'lari bilan AYNAN mos literal union'lar
 * (billing.types.ts pattern'i) + Socket.IO event kontrakti
 * (docs/07-realtime-and-clock.md §7 — nomlar HUJJATDAGIDEK).
 */

// --- Schema enum'lari ---------------------------------------------------------

export type OnlineGameStatusValue =
  | 'PENDING'
  | 'ACTIVE'
  | 'CHECKMATE'
  | 'STALEMATE'
  | 'RESIGNATION'
  | 'TIMEOUT'
  | 'DRAW_AGREED'
  | 'THREEFOLD_REPETITION'
  | 'FIFTY_MOVE_RULE'
  | 'INSUFFICIENT_MATERIAL'
  | 'TIMEOUT_VS_INSUFFICIENT_MATERIAL'
  | 'ABANDONED'
  | 'ABORTED';

export type ClockTypeValue =
  'SUDDEN_DEATH' | 'FISCHER_INCREMENT' | 'BRONSTEIN_DELAY' | 'SIMPLE_DELAY' | 'MULTI_STAGE';

export type TimeCategoryValue = 'CLASSICAL' | 'RAPID' | 'BLITZ' | 'BULLET';

export type ColorValue = 'WHITE' | 'BLACK';

/** Terminal holatlar — docs/07 §4 holat mashinasi ("sabab" holatlari). */
export const TERMINAL_STATUSES: readonly OnlineGameStatusValue[] = [
  'CHECKMATE',
  'STALEMATE',
  'RESIGNATION',
  'TIMEOUT',
  'DRAW_AGREED',
  'THREEFOLD_REPETITION',
  'FIFTY_MOVE_RULE',
  'INSUFFICIENT_MATERIAL',
  'TIMEOUT_VS_INSUFFICIENT_MATERIAL',
  'ABANDONED',
  'ABORTED',
];

// --- Qator shakllari -----------------------------------------------------------

export interface GameRow {
  id: string;
  whitePlayerId: string;
  blackPlayerId: string;
  status: OnlineGameStatusValue;
  timeCategory: TimeCategoryValue;
  clockType: ClockTypeValue;
  baseTimeSeconds: number;
  incrementSeconds: number;
  fen: string;
  pgn: string | null;
  winnerColor: ColorValue | null;
  whiteTimeLeftMs: number | null;
  blackTimeLeftMs: number | null;
  isRated: boolean;
  startedAt: Date | null;
  endedAt: Date | null;
  createdAt: Date;
  /** Nechta yarim-yurish (ply) qilingan — `moves` soni. */
  plyCount: number;
}

export interface MoveRow {
  ply: number;
  san: string;
  uci: string;
  fenAfter: string;
  positionHash: string;
  thinkTimeMs: number | null;
  clockAfterMs: number | null;
}

// --- Redis'dagi jonli soat yozuvi ---------------------------------------------

/** `game:clock:{gameId}` kalitidagi JSON (clock.store.ts). */
export interface ClockEntry {
  /** Optimistik versiya — har muvaffaqiyatli yangilashda +1 (CAS). */
  version: number;
  state: ClockState;
}

// --- Socket.IO kontrakti (docs/07 §7) ------------------------------------------

/** docs/07 §7.3 ClockPayload. */
export interface ClockPayload {
  whiteMs: number;
  blackMs: number;
  /** Kimning soati yuryapti. null = to'xtagan. */
  running: ClockSide | null;
  /** Server yuborgan wall-clock payt (ms) — client displey drift tuzatadi. */
  serverSentAtMs: number;
}

export interface PlayerPayload {
  playerId: string;
  firstName: string;
  lastName: string;
  title: string | null;
  /** Glicko-2 joriy reyting; hech qachon o'ynamagan → 1500 (displey). */
  rating: number;
}

/** docs/07 §7.3 GameStatePayload (birinchi bo'lak kichik to'plami). */
export interface GameStatePayload {
  gameId: string;
  status: OnlineGameStatusValue;
  fen: string;
  /** Boshidan barcha yurishlar — SAN (taxtani qayta qurish uchun, §8.1). */
  moves: string[];
  ply: number;
  clock: ClockPayload;
  timeCategory: TimeCategoryValue;
  clockType: ClockTypeValue;
  baseTimeSeconds: number;
  incrementSeconds: number;
  white: PlayerPayload;
  black: PlayerPayload;
  viewerRole: 'white' | 'black' | 'spectator';
  drawOfferFrom: ClockSide | null;
  winnerColor: ColorValue | null;
  isRated: boolean;
}

/** docs/07 §7.3 MoveMadePayload. */
export interface MoveMadePayload {
  gameId: string;
  ply: number;
  san: string;
  uci: string;
  fen: string;
  clock: ClockPayload;
  /** Shu yurishga sarflangan vaqt (ms). Erkin 1-yurishda 0. */
  msSpent: number;
}

/** docs/07 §7.3 GameEndedPayload (ratingChange — keyingi bosqich). */
export interface GameEndedPayload {
  gameId: string;
  status: OnlineGameStatusValue;
  winnerColor: ColorValue | null;
  finalFen: string;
  clock: ClockPayload;
}

/** docs/07 §3.7 sinxron tick — avtoritativ soat qiymati (drift tuzatish). */
export interface ClockUpdatePayload {
  gameId: string;
  clock: ClockPayload;
}

/** docs/07 §3.8/§8.2 — o'yinchi uzildi; grace tugagach abandon xavfi. */
export interface OpponentGonePayload {
  gameId: string;
  /** Uzilgan tomon. */
  side: ClockSide;
  /** Necha ms ichida qaytmasa o'yin ABANDONED bo'ladi. */
  graceMs: number;
}

/** docs/07 §8.2 — uzilgan o'yinchi grace ichida qaytdi, o'yin davom etadi. */
export interface OpponentBackPayload {
  gameId: string;
  side: ClockSide;
}

/** docs/07 §7.3 GameErrorCode ro'yxatidan ishlatilayotganlari. */
export type GameErrorCode =
  | 'not_your_turn'
  | 'illegal_move'
  | 'game_not_active'
  | 'not_a_player'
  | 'stale_seq'
  | 'clock_expired'
  | 'time_remains'
  | 'no_draw_offer'
  | 'abort_window_closed'
  | 'token_expired'
  | 'rate_limited'
  | 'internal';

export interface GameErrorPayload {
  code: GameErrorCode;
  /** Debug uchun — i18n client tomonda (docs/07 §7.3). */
  message: string;
  /** Rad etilgan yurishda client taxtani shu holatga qaytaradi (rollback). */
  resyncFen?: string;
}

/** docs/07 §7.2 Ack — barcha client→server event'lar uchun bir xil shakl. */
export type Ack<T> = { ok: true; data: T } | { ok: false; error: GameErrorPayload };

export interface MoveAckData {
  ply: number;
  clock: ClockPayload;
}

export interface ClaimTimeoutAckData {
  accepted: boolean;
  remainingMs?: number;
}

// --- Service natija tiplari -----------------------------------------------------

/** docs/07 §5.2 MoveOutcome pattern'i — gateway ack + broadcast uchun. */
export type MoveResult =
  | {
      ok: true;
      move: MoveMadePayload;
      /** Yurish o'yinni tugatgan bo'lsa — broadcast uchun payload. */
      ended: GameEndedPayload | null;
    }
  | {
      ok: false;
      code: GameErrorCode;
      message: string;
      resyncFen?: string;
      /** clock_expired: flag aniqlanib o'yin TIMEOUT bilan tugadi. */
      ended?: GameEndedPayload;
    };

export interface ClaimTimeoutResult {
  accepted: boolean;
  remainingMs?: number;
  ended?: GameEndedPayload;
}

/**
 * Proaktiv flag tekshiruvi natijasi (docs/07 §3.5 2-yo'l):
 *  - ended — flag tasdiqlandi, o'yin TIMEOUT bilan tugadi (broadcast kerak);
 *  - wait  — soatda hali vaqt bor (yurish yetib kelgan) — qayta rejalashtir;
 *  - stop  — o'yin faol emas / soat yurmayapti — taymer kerak emas.
 */
export type FlagCheckResult =
  | { kind: 'ended'; ended: GameEndedPayload }
  | { kind: 'wait'; remainingMs: number }
  | { kind: 'stop' };

/** Matchmaking navbatiga qo'shilish natijasi. */
export type MatchmakingJoinResult = { status: 'queued' } | { status: 'matched'; gameId: string };

/** EventEmitter2 orqali gateway'ga yetkaziladigan ichki hodisa. */
export const PLAY_MATCHED_EVENT = 'play.matched';

export interface PlayMatchedEvent {
  gameId: string;
  whiteUserId: string;
  blackUserId: string;
}

/**
 * O'yin tugadi — modullararo hodisa (fairplay tanlab tahlil triggeri,
 * docs/08 §8.2). EventEmitter2, outbox EMAS — ADR-0008 mezoni: bitta
 * tahlil yo'qolishi pul/natija/huquqqa zarar bermaydi (sampling baribir
 * tasodifiy); kritik qadam (FairPlayCaseOpened) outbox'da.
 */
export const PLAY_GAME_FINISHED_EVENT = 'play.game.finished';

/**
 * Supurgich o'yinni tugatdi (vaqt tugashi yoki tashlab ketish) —
 * room'ga XABAR BERISH kerak.
 *
 * `PLAY_GAME_FINISHED_EVENT` dan FARQI: u tahlil/reyting uchun
 * (fairplay, rating), bu esa faqat transport uchun. Ikkalasini bitta
 * hodisaga qo'shish gateway'ni har tugagan o'yinda broadcast qilishga
 * majburlardi — holbuki odatiy yo'llarda (yurish, taslim, claim)
 * broadcast'ni handler'ning O'ZI qiladi va takrorlanardi.
 *
 * Gateway `server.to(room)` bilan yuboradi; Redis adapter (main.ts)
 * uni BARCHA instansiyalarga tarqatadi, ya'ni o'yinchilar qaysi
 * instansiyada bo'lishidan qat'i nazar xabar oladi.
 */
export const PLAY_GAME_SWEPT_EVENT = 'play.game.swept';

export interface PlayGameSweptEvent {
  gameId: string;
  ended: GameEndedPayload;
}

export interface PlayGameFinishedEvent {
  gameId: string;
  whitePlayerId: string;
  blackPlayerId: string;
  isRated: boolean;
  timeCategory: TimeCategoryValue;
  status: OnlineGameStatusValue;
}

// --- WS event nomlari (docs/07 §7.2, §7.3 — hujjatdagi nomlar) -------------------

export const WS_EVENTS = {
  // client → server
  join: 'game:join',
  move: 'game:move',
  resign: 'game:resign',
  drawOffer: 'game:draw_offer',
  drawAccept: 'game:draw_accept',
  abort: 'game:abort',
  claimTimeout: 'game:claim_timeout',
  // server → client
  state: 'game:state',
  moveMade: 'game:move_made',
  ended: 'game:ended',
  error: 'game:error',
  drawOffered: 'game:draw_offered',
  /** docs/07 §3.7 — davriy avtoritativ soat (client drift tuzatadi). */
  clockUpdate: 'game:clock_update',
  /** docs/07 §8.2 — raqib uzildi (grace boshlandi). */
  opponentGone: 'game:opponent_gone',
  /** docs/07 §8.2 — raqib qaytdi (grace bekor). */
  opponentBack: 'game:opponent_back',
  /** docs/07 kontraktida yo'q — matchmaking topilganda user room'ga yuboriladi. */
  matched: 'matchmaking:matched',
} as const;
