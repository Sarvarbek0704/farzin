/**
 * Metrika yorliqlari — KARDINALLIK QO'RIQCHISI.
 *
 * ═══════════════════════════════════════════════════════════════════════════
 *  docs/15-observability.md §3.4 — "jimgina xarajat bombasi".
 *
 *  Prometheus'da seriya soni = yorliq kombinatsiyalari KO'PAYTMASI. Shuning
 *  uchun bu faylda TANLOV EMAS, QOIDA bor: metrikaga tushadigan har bir
 *  yorliq qiymati SHU YERDAGI yopiq ro'yxatdan o'tadi. Ro'yxatda yo'q qiymat
 *  `other`/`unmatched` ga tushadi — seriya soni har doim chekli.
 *
 *  ⛔  YORLIQ SIFATIDA HECH QACHON ISHLATILMAYDI (§3.4 jadvali):
 *      user_id, player_id, tournament_id, section_id, round_id, game_id,
 *      payment_id, xom URL (`path`), xato matni (`error_message`).
 *      Sabab: ularning har biri CHEKSIZ o'sadi. 300k foydalanuvchi =
 *      300k seriya = xotira portlashi.
 *
 *  ✅  ANIQ ID KERAK BO'LSA — u LOG'da va TRACE'da bo'ladi (§1, §4.3),
 *      metrikada EMAS. Uch ustunning to'g'ri taqsimoti shu.
 *
 *  Bu fayl sof funksiyalar — NestJS ham, OpenTelemetry ham bilmaydi.
 *  Shuning uchun unit testda arzon tekshiriladi (metrics.service.spec.ts).
 * ═══════════════════════════════════════════════════════════════════════════
 */

// --- Umumiy yordamchi ------------------------------------------------------

/**
 * Yopiq ro'yxatga siqish. Ro'yxatda bo'lmagan HAR QANDAY qiymat `fallback`
 * ga tushadi — erkin matn (provayder xatosi, foydalanuvchi kiritmasi)
 * metrikaga hech qachon sizib kirmasin.
 */
export function sanitizeLabel<T extends string>(
  value: string | null | undefined,
  allowed: readonly T[],
  fallback: T,
): T {
  if (value === null || value === undefined) {
    return fallback;
  }
  const normalized = value.trim().toLowerCase();
  return (allowed as readonly string[]).includes(normalized) ? (normalized as T) : fallback;
}

// --- Seksiya hajmi (§3.4 "O'rniga" misoli) ---------------------------------

export const SECTION_SIZE_BUCKETS = ['xs', 's', 'm', 'l', 'xl'] as const;
export type SectionSizeBucket = (typeof SECTION_SIZE_BUCKETS)[number];

/**
 * O'yinchi soni → hajm guruhi. docs/15 §3.4 dagi funksiya AYNAN.
 *
 *   xs ≤ 20 < s ≤ 50 < m ≤ 100 < l ≤ 300 < xl
 *
 * `tournament_id` o'rniga SHU ishlatiladi: 5 ta seriya, cheksiz emas.
 */
export function sectionSizeBucket(playerCount: number): SectionSizeBucket {
  if (playerCount <= 20) {
    return 'xs';
  }
  if (playerCount <= 50) {
    return 's';
  }
  if (playerCount <= 100) {
    return 'm';
  }
  if (playerCount <= 300) {
    return 'l';
  }
  return 'xl';
}

// --- Juftlashtirish --------------------------------------------------------

export const PAIRING_ALGORITHMS = [
  'swiss_dutch',
  'round_robin',
  'double_round_robin',
  'other',
] as const;
export type PairingAlgorithmLabel = (typeof PAIRING_ALGORITHMS)[number];

/** prisma `PairingSystem` → yorliq (yopiq ro'yxat, noma'lum → `other`). */
export function pairingAlgorithmLabel(pairingSystem: string): PairingAlgorithmLabel {
  return sanitizeLabel(pairingSystem, PAIRING_ALGORITHMS, 'other');
}

/**
 * docs/15 §3.3: `reason: NO_VALID_PAIRING | TIMEOUT | ABSOLUTE_CRITERIA_VIOLATION`.
 * `UNEXPECTED` — QO'SHILGAN: dvigateldan kutilmagan xato chiqsa u ham
 * ko'rinsin (jimgina yo'qolgan xato — eng yomon variant).
 */
export const PAIRING_FAILURE_REASONS = [
  'NO_VALID_PAIRING',
  'TIMEOUT',
  'ABSOLUTE_CRITERIA_VIOLATION',
  'UNEXPECTED',
] as const;
export type PairingFailureReason = (typeof PAIRING_FAILURE_REASONS)[number];

/**
 * Buzilgan absolyut kriteriy — core/pairing/swiss/verify.ts dagi
 * `PairingCriterion` bilan AYNAN bir xil to'plam (4 ta seriya).
 *
 * DEVIATSIYA (halol qayd): docs/15 §3.3 misolda `C1_REPEAT | C2_COLOR`
 * deb yozilgan. Amaldagi FIDE C.04.3 2026-02 raqamlashida (verify.ts
 * sarlavhasi) C2 — PAB huquqi, rang chegaralari esa C3. Metrika nomi
 * hujjatdan AYNAN olingan; yorliq qiymatlari esa kodning haqiqatiga mos.
 */
export const PAIRING_CRITERIA = ['C1_REPEAT', 'C2_BYE', 'C3_COLOR', 'COVERAGE'] as const;
export type PairingCriterionLabel = (typeof PAIRING_CRITERIA)[number];

// --- O'yin -----------------------------------------------------------------

/** docs/15 §3.3 `farzin_active_games` — `online | tournament | broadcast`. */
export const GAME_TYPES = ['online', 'tournament', 'broadcast'] as const;
export type GameTypeLabel = (typeof GAME_TYPES)[number];

/** docs/15 §3.3 `farzin_websocket_connections` — `play | broadcast | arbiter`. */
export const WS_NAMESPACES = ['play', 'broadcast', 'arbiter'] as const;
export type WsNamespaceLabel = (typeof WS_NAMESPACES)[number];

/** `game_type` yorlig'i — prisma `TimeCategory` enum'i (4 ta qiymat). */
export const TIME_CATEGORIES = ['bullet', 'blitz', 'rapid', 'classical', 'other'] as const;
export type TimeCategoryLabel = (typeof TIME_CATEGORIES)[number];

export function timeCategoryLabel(category: string): TimeCategoryLabel {
  return sanitizeLabel(category, TIME_CATEGORIES, 'other');
}

/** docs/15 §3.3 `farzin_game_disconnects_total` — `reconnected | forfeited | aborted`. */
export const DISCONNECT_OUTCOMES = ['reconnected', 'forfeited', 'aborted'] as const;
export type DisconnectOutcomeLabel = (typeof DISCONNECT_OUTCOMES)[number];

// --- Reyting ---------------------------------------------------------------

/**
 * DEVIATSIYA (halol qayd): docs/15 §3.3 da yorliq `federation_id`.
 * Farzin'da reyting davri federatsiya bo'yicha EMAS, (muhit × vaqt
 * kategoriyasi) bo'yicha bo'linadi (docs/06 §5.1) — federatsiya bitta
 * (milliy reyting). Shuning uchun yorliqlar shu ikkisi: 2 × 4 = ko'pi
 * bilan 8 seriya, `federation_id` dan ham arzon.
 */
export const PLAY_ENVIRONMENTS = ['otb', 'online', 'other'] as const;
export type PlayEnvironmentLabel = (typeof PLAY_ENVIRONMENTS)[number];

export function playEnvironmentLabel(environment: string): PlayEnvironmentLabel {
  return sanitizeLabel(environment, PLAY_ENVIRONMENTS, 'other');
}

// --- To'lov ----------------------------------------------------------------

/** prisma `PaymentProvider` (docs/09 §1) — yopiq to'plam. */
export const PAYMENT_PROVIDERS = ['click', 'payme', 'uzum', 'manual', 'other'] as const;
export type PaymentProviderLabel = (typeof PAYMENT_PROVIDERS)[number];

export function paymentProviderLabel(provider: string): PaymentProviderLabel {
  return sanitizeLabel(provider, PAYMENT_PROVIDERS, 'other');
}

/**
 * To'lov muvaffaqiyatsizligi sababi — KOD, matn EMAS (§3.4:
 * `error_message` yorliq bo'lmaydi, u cheksiz).
 */
export const PAYMENT_FAILURE_REASONS = [
  'PROVIDER_NOT_CONFIGURED',
  'INVOICE_NOT_OPEN',
  'AMOUNT_MISMATCH',
  'REFUND_REJECTED',
  'PROVIDER_ERROR',
  'OTHER',
] as const;
export type PaymentFailureReason = (typeof PAYMENT_FAILURE_REASONS)[number];

/** `farzin_payment_duration_seconds` ning `operation` yorlig'i. */
export const PAYMENT_OPERATIONS = ['checkout', 'webhook', 'refund', 'confirm'] as const;
export type PaymentOperationLabel = (typeof PAYMENT_OPERATIONS)[number];

// --- Turnir ----------------------------------------------------------------

/**
 * DEVIATSIYA (halol qayd): docs/15 §3.3 izohida `registration | in_progress
 * | finishing`. Farzin'ning holat mashinasida (docs/03 TournamentStatus)
 * `finishing` YO'Q; uning o'rniga REGISTRATION_CLOSED bor. Yorliqlar
 * bizning enum'imizdan olinadi — 3 ta "davom etayotgan" holat.
 */
export const ACTIVE_TOURNAMENT_STATUSES = [
  'registration_open',
  'registration_closed',
  'in_progress',
] as const;
export type ActiveTournamentStatusLabel = (typeof ACTIVE_TOURNAMENT_STATUSES)[number];

// --- Fair play -------------------------------------------------------------

/** prisma `FairPlaySignalType` — docs/08 §2. */
export const FAIRPLAY_SIGNAL_TYPES = [
  'engine_correlation',
  'timing_anomaly',
  'behavioral',
  'report',
  'other',
] as const;
export type FairplaySignalTypeLabel = (typeof FAIRPLAY_SIGNAL_TYPES)[number];

export function fairplaySignalTypeLabel(type: string): FairplaySignalTypeLabel {
  return sanitizeLabel(type, FAIRPLAY_SIGNAL_TYPES, 'other');
}

/**
 * Signal kuchi (0..1) → uch pog'onali `severity`.
 *
 * Nega pog'ona: xom `strength` yorliq bo'lsa — har o'nlik kasr yangi
 * seriya (§3.4). Chegaralar (0.4 / 0.7) — DASHBOARD uchun ko'rsatkich,
 * qaror chegarasi EMAS: qaror FAIRPLAY_SUSPICION_THRESHOLD bilan
 * service qatlamida (docs/08 §4.1 — metrika hech kimni jazolamaydi).
 */
export const FAIRPLAY_SEVERITIES = ['low', 'medium', 'high'] as const;
export type FairplaySeverityLabel = (typeof FAIRPLAY_SEVERITIES)[number];

export function fairplaySeverity(strength: number): FairplaySeverityLabel {
  if (strength >= 0.7) {
    return 'high';
  }
  if (strength >= 0.4) {
    return 'medium';
  }
  return 'low';
}

// --- HTTP (RED — docs/15 §3.1, §3.2) ---------------------------------------

export const HTTP_METHODS = [
  'GET',
  'POST',
  'PUT',
  'PATCH',
  'DELETE',
  'HEAD',
  'OPTIONS',
  'OTHER',
] as const;
export type HttpMethodLabel = (typeof HTTP_METHODS)[number];

export function httpMethodLabel(method: string | undefined): HttpMethodLabel {
  const upper = (method ?? '').trim().toUpperCase();
  return (HTTP_METHODS as readonly string[]).includes(upper)
    ? (upper as HttpMethodLabel)
    : 'OTHER';
}

/** Yo'l shabloni topilmagan so'rov (404, mos kelmagan) uchun yagona qiymat. */
export const UNMATCHED_ROUTE = 'unmatched';

const UUID_SEGMENT = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const NUMERIC_SEGMENT = /^\d+$/;
const LONG_HEX_SEGMENT = /^[0-9a-f]{16,}$/i;

/** Yorliq uzunligi chegarasi — buzuq input metrikani shishirmasin. */
const MAX_ROUTE_LENGTH = 120;

/**
 * Yo'l SHABLONI (`/api/v1/tournaments/:id`), xom URL EMAS.
 *
 * docs/15 §3.2 dagi qat'iy ogohlantirish:
 *   `/tournaments/:id`     → BITTA seriya
 *   `/tournaments/<uuid>`  → har turnir uchun alohida seriya = portlash
 *
 * Express `req.route.path` allaqachon shablon beradi. Ikkinchi qavat
 * himoya sifatida bu funksiya UUID / raqam / uzun hex bo'laklarni
 * baribir `:id` ga almashtiradi — express kutilmagan narsa bersa ham
 * kardinallik chegarada qoladi.
 */
export function sanitizeRoute(routePath: string | null | undefined): string {
  if (routePath === null || routePath === undefined || routePath.trim() === '') {
    return UNMATCHED_ROUTE;
  }
  const normalized = routePath
    .split('/')
    .map((segment) => {
      if (segment === '' || segment.startsWith(':')) {
        return segment;
      }
      if (
        UUID_SEGMENT.test(segment) ||
        NUMERIC_SEGMENT.test(segment) ||
        LONG_HEX_SEGMENT.test(segment)
      ) {
        return ':id';
      }
      return segment;
    })
    .join('/');

  return normalized.length > MAX_ROUTE_LENGTH
    ? normalized.slice(0, MAX_ROUTE_LENGTH)
    : normalized;
}

/**
 * Status kodi yorlig'i — butun son sifatida (5xx guruhlash Prometheus
 * so'rovida `status=~"5.."` bilan qilinadi, §6.3 SLO qoidalari shunga
 * tayanadi). Nostandart kod → '0'.
 */
export function httpStatusLabel(statusCode: number | undefined): string {
  if (statusCode === undefined || !Number.isInteger(statusCode)) {
    return '0';
  }
  return statusCode >= 100 && statusCode <= 599 ? String(statusCode) : '0';
}
