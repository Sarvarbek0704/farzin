/**
 * Fairplay moduli — PUBLIC tiplar.
 *
 * ═══════════════════════════════════════════════════════════════════════════
 *  KANON (docs/08-fair-play.md §0, CANON §7.5):
 *  BU MODUL EHTIMOLLIK ISHLAB CHIQARADI, ISBOT EMAS.
 *
 *  Hech bir tip, hech bir maydon "aybdor" degan ma'noni tashimaydi.
 *  suspicionScore/aggregateScore — faqat komissiya navbatining
 *  tartiblagichi. Jazo (sanctionUntil) FAQAT odam qarori + yozma asos
 *  (decisionRationale) bilan o'rnatiladi — boshqa kod yo'li YO'Q.
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * prisma/schema.prisma enum'lari bilan AYNAN mos literal union'lar
 * (billing.types.ts / play.types.ts pattern'i).
 */

// --- Schema enum'lari ---------------------------------------------------------

export type FairPlayCaseStatusValue =
  | 'OPEN'
  | 'UNDER_REVIEW'
  | 'CLOSED_NO_ACTION'
  | 'CLOSED_WARNING'
  | 'CLOSED_SANCTION'
  | 'APPEALED';

export type FairPlaySignalTypeValue =
  | 'ENGINE_CORRELATION'
  | 'TIMING_ANOMALY'
  | 'RATING_JUMP'
  | 'BROWSER_FOCUS_LOSS'
  | 'DEVICE_FINGERPRINT'
  | 'MULTI_ACCOUNT'
  | 'MANUAL_REPORT';

export type AppealStatusValue =
  | 'SUBMITTED'
  | 'UNDER_REVIEW'
  | 'UPHELD'
  | 'REJECTED'
  | 'WITHDRAWN';

/** Komissiya qarori — decide endpointida ruxsat etilgan terminal holatlar. */
export type CaseDecisionValue = 'CLOSED_NO_ACTION' | 'CLOSED_WARNING' | 'CLOSED_SANCTION';

/** Apellyatsiya qarori. */
export type AppealDecisionValue = 'UPHELD' | 'REJECTED';

// --- Qator shakllari -----------------------------------------------------------

export interface FairPlayCaseRow {
  id: string;
  playerId: string;
  status: FairPlayCaseStatusValue;
  aggregateScore: number | null;
  reviewedBy: string | null;
  reviewedAt: Date | null;
  decisionRationale: string | null;
  sanctionUntil: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface FairPlaySignalRow {
  id: string;
  caseId: string;
  type: FairPlaySignalTypeValue;
  strength: number;
  evidence: unknown;
  createdAt: Date;
}

export interface FairPlayReportRow {
  id: string;
  gameId: string;
  playerId: string;
  topMoveMatchRate: number | null;
  avgCentipawnLoss: number | null;
  timingVariance: number | null;
  suspicionScore: number | null;
  engineName: string | null;
  engineDepth: number | null;
  analysisMs: number | null;
  createdAt: Date;
}

export interface AppealRow {
  id: string;
  playerId: string;
  subjectType: string;
  subjectId: string;
  fairPlayCaseId: string | null;
  status: AppealStatusValue;
  reason: string;
  reviewedBy: string | null;
  reviewedAt: Date | null;
  decision: string | null;
  createdAt: Date;
}

/** Komissiya ko'rinishi — ish + dalillar (docs/08 §4.2 2-band). */
export interface FairPlayCaseDetail {
  case: FairPlayCaseRow;
  signals: FairPlaySignalRow[];
  /** Shu o'yinchining avtomatik tahlil hisobotlari (eng shubhalilari). */
  reports: FairPlayReportRow[];
  appeals: AppealRow[];
}

/**
 * O'yinchining O'ZI ko'radigan cheklangan ko'rinish (docs/08 §6.2 —
 * bilish huquqi; docs/14 Faza 6: "aniq chegaralar oshkor qilinmaydi").
 * ATAYLAB YO'Q: aggregateScore, signal ro'yxati, detektsiya ichki
 * detallari — chegara qiymatlari teskari muhandislik qilinmasin.
 */
export interface FairPlayCaseOwnView {
  id: string;
  status: FairPlayCaseStatusValue;
  /** Qaror asosi — qaror chiqqandan keyin o'yinchi ko'radi (§6.2 2-band). */
  decisionRationale: string | null;
  sanctionUntil: Date | null;
  createdAt: Date;
  reviewedAt: Date | null;
}
