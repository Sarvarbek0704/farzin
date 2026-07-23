import { BusinessRuleError } from '../../core/errors/domain.error';

/**
 * Turnir holat mashinasi — SOF funksiya, framework va Prisma bog'liqliksiz.
 *
 * Qiymatlar `prisma/schema.prisma` dagi `TournamentStatus` enum bilan AYNAN
 * mos (string literal — service qatlamida Prisma import taqiqlangan,
 * .dependency-cruiser.js `prisma-only-in-infrastructure`).
 *
 * Ruxsat etilgan o'tishlar (docs/14-roadmap.md — Faza 1, "Turnir holati"):
 *
 *   DRAFT → REGISTRATION_OPEN → REGISTRATION_CLOSED → IN_PROGRESS → COMPLETED
 *
 * CANCELLED — DRAFT/REGISTRATION_OPEN/REGISTRATION_CLOSED/IN_PROGRESS dan
 * yetib boriladi. COMPLETED va CANCELLED — terminal holatlar.
 * Boshqa HECH QANDAY o'tish yo'q — holat mashinasi murakkablashib
 * ketmasligi uchun (docs/14-roadmap.md Faza 1 xavflar jadvali).
 */

export const TOURNAMENT_STATUSES = [
  'DRAFT',
  'REGISTRATION_OPEN',
  'REGISTRATION_CLOSED',
  'IN_PROGRESS',
  'COMPLETED',
  'CANCELLED',
] as const;

export type TournamentStatus = (typeof TOURNAMENT_STATUSES)[number];

/** Har holatdan chiqish mumkin bo'lgan holatlar — yagona haqiqat manbai. */
const ALLOWED_TRANSITIONS: Readonly<Record<TournamentStatus, readonly TournamentStatus[]>> = {
  DRAFT: ['REGISTRATION_OPEN', 'CANCELLED'],
  REGISTRATION_OPEN: ['REGISTRATION_CLOSED', 'CANCELLED'],
  REGISTRATION_CLOSED: ['IN_PROGRESS', 'CANCELLED'],
  IN_PROGRESS: ['COMPLETED', 'CANCELLED'],
  COMPLETED: [],
  CANCELLED: [],
};

export function canTransition(from: TournamentStatus, to: TournamentStatus): boolean {
  return ALLOWED_TRANSITIONS[from].includes(to);
}

/** O'tish taqiqlangan bo'lsa — `BusinessRuleError('INVALID_STATUS_TRANSITION')`. */
export function assertTransition(from: TournamentStatus, to: TournamentStatus): void {
  if (!canTransition(from, to)) {
    throw new BusinessRuleError(
      'INVALID_STATUS_TRANSITION',
      `Turnir holati ${from} dan ${to} ga o'tkazilmaydi`,
      { from, to },
    );
  }
}
