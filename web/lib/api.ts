/**
 * Farzin backend bilan aloqa — FAQAT ommaviy (@Public) endpointlar.
 *
 * ═══════════════════════════════════════════════════════════════════════════
 *  NEGA TanStack Query EMAS (docs/12-frontend-spec.md dan chekinish)
 *
 *  Spetsifikatsiya TanStack Query'ni ko'rsatadi va u INTERAKTIV qism
 *  (hakam konsoli, onlayn o'yin) uchun to'g'ri tanlov. Lekin bu bo'lak
 *  butunlay O'QISH uchun: turnir kalendari, jadval, reyting ro'yxati.
 *  Ular React Server Component'da bir marta olinadi va HTML bo'lib
 *  yetkaziladi — klientda kesh, invalidatsiya yoki qayta so'rov KERAK
 *  EMAS. Query'ni bu yerga qo'shish klient bandliligini oshiradi va
 *  hech narsa bermaydi.
 *
 *  Interaktiv bo'lak qo'shilganda TanStack Query o'sha yerda kiritiladi.
 * ═══════════════════════════════════════════════════════════════════════════
 */

/**
 * Server tomonda to'g'ridan-to'g'ri API'ga boramiz (konteyner ichida
 * `farzin-app:3000`), brauzerda esa `/api/...` — next.config.ts dagi
 * rewrite orqali. Shu tufayli CORS muammosi umuman tug'ilmaydi.
 */
const SERVER_BASE = process.env.FARZIN_API_URL ?? 'http://localhost:3000';

function url(path: string): string {
  return typeof window === 'undefined' ? `${SERVER_BASE}${path}` : path;
}

/** RFC 9457 Problem Details — backend har xatoni shu shaklda qaytaradi. */
export interface ProblemDetails {
  type: string;
  title: string;
  status: number;
  code: string;
  instance?: string;
  traceId?: string;
}

export class ApiError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

/**
 * GET so'rovi.
 *
 * `cache: 'no-store'` — turnir jadvali va reyting TEZ o'zgaradi;
 * eskirgan natija ko'rsatish hakam uchun ham, o'yinchi uchun ham
 * chalg'ituvchi. Statik keshlash keyinroq, o'lchov bilan qo'shiladi.
 */
async function get<T>(path: string): Promise<T> {
  const res = await fetch(url(path), {
    cache: 'no-store',
    headers: { Accept: 'application/json' },
  });

  if (!res.ok) {
    let problem: Partial<ProblemDetails> = {};
    try {
      problem = (await res.json()) as Partial<ProblemDetails>;
    } catch {
      // Javob JSON emas (masalan proxy xatosi) — status bilan cheklanamiz.
    }
    throw new ApiError(
      res.status,
      problem.code ?? 'UNKNOWN',
      problem.title ?? `So'rov muvaffaqiyatsiz (${String(res.status)})`,
    );
  }

  return (await res.json()) as T;
}

/** Cursor pagination konverti (docs/04-api-spec.md §3). */
export interface Page<T> {
  items: T[];
  pageInfo: { hasNextPage: boolean; endCursor: string | null };
}

// --- Turnir ------------------------------------------------------------------

export type TournamentStatus =
  | 'DRAFT'
  | 'REGISTRATION_OPEN'
  | 'REGISTRATION_CLOSED'
  | 'IN_PROGRESS'
  | 'COMPLETED'
  | 'CANCELLED';

export interface Tournament {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  status: TournamentStatus;
  venueName: string | null;
  address: string | null;
  startDate: string;
  endDate: string;
  /** Tiyinda (ADR-0006) va STRING — 2^53 dan katta son yo'qolmasin. */
  entryFeeAmount: string | null;
  entryFeeCurrency: string;
  isFideRated: boolean;
  isNationallyRated: boolean;
}

export interface Section {
  id: string;
  tournamentId: string;
  name: string;
  pairingSystem: string;
  timeCategory: string;
  environment: string;
  totalRounds: number;
  baseTimeSeconds: number;
  incrementSeconds: number;
  maxPlayers: number | null;
}

export interface Registration {
  id: string;
  playerId: string;
  firstName: string | null;
  lastName: string | null;
  title: string | null;
  fideId: string | null;
}

export interface Standing {
  registrationId: string;
  /** Ochko STRING — backend `points.toFixed(1)` bilan yuboradi. */
  points: string;
  rank: number;
  tieBreakValues: Record<string, number>;
  gamesPlayed: number;
  wins: number;
  draws: number;
  losses: number;
  colorHistory: string[];
  floatHistory: string[];
}

export const listTournaments = (): Promise<Page<Tournament>> =>
  get<Page<Tournament>>('/api/v1/tournaments?first=50');

export const getTournament = (id: string): Promise<Tournament> =>
  get<Tournament>(`/api/v1/tournaments/${id}`);

export const listSections = (tournamentId: string): Promise<Section[]> =>
  get<Section[]>(`/api/v1/tournaments/${tournamentId}/sections`);

export const listRegistrations = (sectionId: string): Promise<Registration[]> =>
  get<Registration[]>(`/api/v1/sections/${sectionId}/registrations`);

export const listStandings = (sectionId: string): Promise<Standing[]> =>
  get<Standing[]>(`/api/v1/sections/${sectionId}/standings`);

// --- Reyting -----------------------------------------------------------------

export interface RatingRow {
  playerId: string;
  firstName: string | null;
  lastName: string | null;
  title: string | null;
  rating: number;
  /** RD — ishonch oralig'i. OCHIQ ko'rsatiladi (docs/14 Faza 3). */
  deviation: number;
  gamesPlayed: number;
}

export const listRatings = (query: {
  environment: string;
  timeCategory: string;
}): Promise<Page<RatingRow>> =>
  get<Page<RatingRow>>(
    `/api/v1/ratings?environment=${query.environment}&timeCategory=${query.timeCategory}&first=100`,
  );

// --- O'yinchi ----------------------------------------------------------------

export interface Player {
  id: string;
  firstName: string;
  lastName: string;
  middleName: string | null;
  birthDate: string | null;
  gender: string | null;
  fideId: string | null;
  title: string | null;
  isPublic: boolean;
}

export interface RatingHistoryRow {
  periodId: string;
  environment: string;
  timeCategory: string;
  ratingBefore: number;
  ratingAfter: number;
  deviationAfter: number;
  gamesInPeriod: number;
  computedAt: string;
}

export const getPlayer = (id: string): Promise<Player> => get<Player>(`/api/v1/players/${id}`);

export const getRatingHistory = (id: string): Promise<Page<RatingHistoryRow>> =>
  get<Page<RatingHistoryRow>>(`/api/v1/players/${id}/rating-history?first=20`);

// --- Onlayn o'yin (tomoshabin) ------------------------------------------------

export interface GamePlayer {
  playerId: string;
  firstName: string;
  lastName: string;
  title: string | null;
  rating: number;
}

export interface GameState {
  gameId: string;
  status: string;
  /** Joriy pozitsiya — taxta shundan chiziladi. */
  fen: string;
  /** Boshidan barcha yurishlar, SAN. */
  moves: string[];
  ply: number;
  clock: { whiteMs: number; blackMs: number; running: 'w' | 'b' | null };
  timeCategory: string;
  baseTimeSeconds: number;
  incrementSeconds: number;
  white: GamePlayer;
  black: GamePlayer;
  isRated: boolean;
}

export const getGame = (id: string): Promise<GameState> =>
  get<GameState>(`/api/v1/play/games/${id}`);
