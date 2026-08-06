import { Injectable } from '@nestjs/common';
import type {
  Appeal,
  FairPlayCase,
  FairPlayReport,
  FairPlaySignal,
  Prisma,
} from '@prisma/client';

import { aggregateSuspicion } from '../../core/fairplay/suspicion-aggregation';
import { AuditService } from '../../shared/audit/audit.service';
import { OutboxService } from '../../shared/outbox/outbox.service';
import { PrismaService } from '../../shared/prisma/prisma.service';
import type { OnlineGameStatusValue, TimeCategoryValue } from '../play/play.types';
import type {
  AppealRow,
  CaseDecisionValue,
  FairPlayCaseDetail,
  FairPlayCaseRow,
  FairPlayReportRow,
  FairPlaySignalRow,
  FairPlaySignalTypeValue,
} from './fairplay.types';

/**
 * Fairplay ma'lumot qatlami — Prisma FAQAT shu faylda
 * (.dependency-cruiser `prisma-only-in-infrastructure`).
 *
 * ═══════════════════════════════════════════════════════════════════════════
 *  STRUKTURAVIY KAFOLAT — AVTOMATIK JAZO YO'Q (docs/08 §4.1, CANON §7.5).
 *
 *  `sanctionUntil`ni yozadigan YAGONA metod — `decideCase`, va u
 *  MAJBURIY `actorUserId` (odam!) + MAJBURIY `rationale` qabul qiladi.
 *  `recordSignals` (mashina yo'li) ish YARATADI — lekin faqat OPEN
 *  holatda, sanksiyasiz: ish komissiyaga KO'RINADI, jazo esa yo'q.
 *  Bu invariant integration testda tasdiqlangan (fairplay.spec.ts,
 *  docs/14 Faza 6 DoD: "Hech qanday avtomatik jazo yo'qligi kod'da
 *  tasdiqlangan").
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * O'yin ma'lumoti: OnlineGame/Move o'qishlari shu repository'da —
 * "modul boshqa modul jadvalini o'qimaydi" qoidasidan ONGLI chetlanish:
 * tahlil butun Move seriyasini talab qiladi, port orqali sahifalab olish
 * sun'iy murakkablik bo'lardi. Faqat O'QISH; yozuv hech qachon yo'q.
 */

export interface GameMoveForAnalysis {
  ply: number;
  uci: string;
  fenAfter: string;
  thinkTimeMs: number | null;
}

export interface GameForAnalysis {
  id: string;
  whitePlayerId: string;
  blackPlayerId: string;
  status: OnlineGameStatusValue;
  isRated: boolean;
  timeCategory: TimeCategoryValue;
  moves: GameMoveForAnalysis[];
}

export interface UpsertReportInput {
  gameId: string;
  playerId: string;
  topMoveMatchRate: number | null;
  avgCentipawnLoss: number | null;
  /** Sekund² birligida (schema Decimal(10,4) sig'imi uchun; hujjatlangan). */
  timingVariance: number | null;
  suspicionScore: number | null;
  engineName: string | null;
  engineDepth: number | null;
  analysisMs: number | null;
}

export interface NewSignalInput {
  type: FairPlaySignalTypeValue;
  strength: number;
  /** Komissiya ko'radigan xom dalil. gameId dedupe kaliti sifatida ishlatiladi. */
  evidence: Prisma.InputJsonValue;
}

export interface RecordSignalsInput {
  playerId: string;
  /** Signal qaysi o'yindan — idempotentlik dedupe kaliti (null = o'yinsiz signal). */
  gameId: string | null;
  signals: NewSignalInput[];
  /** null = tizim (processor); odam bo'lsa (manual report) — reporter. */
  actorUserId: string | null;
  auditAction: 'fairplay.flagged' | 'fairplay.reported';
}

export interface DecideCaseInput {
  caseId: string;
  decision: CaseDecisionValue;
  /** MAJBURIY yozma asos — service tekshiradi, audit REASON_REQUIRED majburlaydi. */
  rationale: string;
  sanctionUntil: Date | null;
  /** Qaror qabul qilgan ODAM — hech qachon null emas. */
  actorUserId: string;
}

export interface DecideAppealInput {
  appealId: string;
  decision: 'UPHELD' | 'REJECTED';
  decisionText: string;
  actorUserId: string;
}

@Injectable()
export class FairplayRepository {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly outbox: OutboxService,
  ) {}

  // --- O'yin (faqat o'qish) ---------------------------------------------------

  async findGameForAnalysis(gameId: string): Promise<GameForAnalysis | null> {
    const game = await this.prisma.onlineGame.findUnique({
      where: { id: gameId },
      include: {
        moves: {
          orderBy: { ply: 'asc' },
          select: { ply: true, uci: true, fenAfter: true, thinkTimeMs: true },
        },
      },
    });
    if (game === null) {
      return null;
    }
    return {
      id: game.id,
      whitePlayerId: game.whitePlayerId,
      blackPlayerId: game.blackPlayerId,
      status: game.status,
      isRated: game.isRated,
      timeCategory: game.timeCategory,
      moves: game.moves,
    };
  }

  /** Manual report uchun yengil o'qish — Move seriyasisiz. */
  async findGameBasic(gameId: string): Promise<{
    id: string;
    whitePlayerId: string;
    blackPlayerId: string;
    status: OnlineGameStatusValue;
  } | null> {
    return await this.prisma.onlineGame.findUnique({
      where: { id: gameId },
      select: { id: true, whitePlayerId: true, blackPlayerId: true, status: true },
    });
  }

  // --- FairPlayReport (mashina o'lchovi) ---------------------------------------

  /**
   * IDEMPOTENT: at-least-once navbat (ADR-0008) — bir xil job ikki marta
   * kelsa upsert bitta qatorni yangilaydi (@@unique gameId+playerId).
   */
  async upsertReport(input: UpsertReportInput): Promise<FairPlayReportRow> {
    const data = {
      topMoveMatchRate: input.topMoveMatchRate,
      avgCentipawnLoss: input.avgCentipawnLoss,
      timingVariance: input.timingVariance,
      suspicionScore: input.suspicionScore,
      engineName: input.engineName,
      engineDepth: input.engineDepth,
      analysisMs: input.analysisMs,
    };
    const row = await this.prisma.fairPlayReport.upsert({
      where: { gameId_playerId: { gameId: input.gameId, playerId: input.playerId } },
      create: { gameId: input.gameId, playerId: input.playerId, ...data },
      update: data,
    });
    return toReportRow(row);
  }

  // --- Signal + ish (ko'rinish, JAZO EMAS) -------------------------------------

  /**
   * Signal yozish: ochiq ish bo'lsa unga qo'shiladi, bo'lmasa YANGI ish
   * OPEN holatda ochiladi. Ish ochilishi = komissiya navbatiga tushish,
   * XOLOS — sanksiya maydonlariga BU YO'L hech qachon tegmaydi (§4.1).
   *
   * Idempotentlik: bir xil (type + evidence.gameId) signal ishda allaqachon
   * bo'lsa qayta yozilmaydi (at-least-once navbat).
   *
   * Audit + outbox (FairPlayCaseOpened — ADR-0008 kritik ro'yxatida)
   * BIR tranzaksiyada.
   */
  async recordSignals(input: RecordSignalsInput): Promise<{ caseId: string; created: boolean }> {
    return await this.prisma.$transaction(async (tx) => {
      let fpCase = await tx.fairPlayCase.findFirst({
        where: { playerId: input.playerId, status: { in: ['OPEN', 'UNDER_REVIEW'] } },
        orderBy: { createdAt: 'desc' },
      });
      const created = fpCase === null;
      fpCase ??= await tx.fairPlayCase.create({
        data: { playerId: input.playerId, status: 'OPEN' },
      });

      const existing = await tx.fairPlaySignal.findMany({
        where: { caseId: fpCase.id },
        select: { type: true, strength: true, evidence: true },
      });

      const fresh = input.signals.filter((s) => {
        if (input.gameId === null) {
          return true;
        }
        return !existing.some(
          (e) =>
            e.type === s.type &&
            evidenceField(e.evidence, 'gameId') === input.gameId &&
            // MANUAL_REPORT: har reporter alohida dalil — dedupe reporter
            // bo'yicha (bir o'yin haqida ikki odam shikoyati ikkalasi qoladi).
            (s.type !== 'MANUAL_REPORT' ||
              evidenceField(e.evidence, 'reporterUserId') ===
                evidenceField(s.evidence, 'reporterUserId')),
        );
      });

      if (fresh.length > 0) {
        await tx.fairPlaySignal.createMany({
          data: fresh.map((s) => ({
            caseId: fpCase.id,
            type: s.type,
            strength: s.strength,
            evidence: s.evidence,
          })),
        });
      }

      // aggregateScore — BUTUN signal to'plamidan qayta hisoblanadi
      // (core sof funksiya). Bu faqat navbat tartiblagichi (docs/08 §4.2).
      const allSignals = [
        ...existing.map((e) => ({ kind: e.type, strength: e.strength.toNumber() })),
        ...fresh.map((s) => ({ kind: s.type, strength: s.strength })),
      ];
      const aggregate = aggregateSuspicion(allSignals);
      await tx.fairPlayCase.update({
        where: { id: fpCase.id },
        data: { aggregateScore: aggregate },
      });

      await this.audit.write(tx, {
        action: input.auditAction,
        actorUserId: input.actorUserId,
        resourceType: 'FairPlayCase',
        resourceId: fpCase.id,
        after: {
          playerId: input.playerId,
          gameId: input.gameId,
          newSignals: fresh.map((s) => ({ type: s.type, strength: s.strength })),
          aggregateScore: aggregate,
          caseCreated: created,
        },
      });

      if (created) {
        await this.outbox.enqueue(tx, {
          eventType: 'FairPlayCaseOpened',
          aggregateType: 'FairPlayCase',
          aggregateId: fpCase.id,
          payload: { caseId: fpCase.id, playerId: input.playerId },
        });
      }

      return { caseId: fpCase.id, created };
    });
  }

  // --- Ish (komissiya) ---------------------------------------------------------

  async findCaseById(id: string): Promise<FairPlayCaseRow | null> {
    const row = await this.prisma.fairPlayCase.findUnique({ where: { id } });
    return row === null ? null : toCaseRow(row);
  }

  /**
   * Komissiya navbati — aggregateScore DESC (NULLS LAST), keyin id ASC.
   * Keyset cursor: aftterId qatorining skori bo'yicha (docs/04 §3 —
   * OFFSET ishlatilmaydi).
   */
  async listCases(first: number, afterId: string | null): Promise<FairPlayCaseRow[]> {
    let where: Prisma.FairPlayCaseWhereInput = {};
    if (afterId !== null) {
      const after = await this.prisma.fairPlayCase.findUnique({
        where: { id: afterId },
        select: { id: true, aggregateScore: true },
      });
      if (after === null) {
        return [];
      }
      where =
        after.aggregateScore === null
          ? { AND: [{ aggregateScore: null }, { id: { gt: after.id } }] }
          : {
              OR: [
                { aggregateScore: { lt: after.aggregateScore } },
                { AND: [{ aggregateScore: after.aggregateScore }, { id: { gt: after.id } }] },
                { aggregateScore: null },
              ],
            };
    }

    const rows = await this.prisma.fairPlayCase.findMany({
      where,
      orderBy: [{ aggregateScore: { sort: 'desc', nulls: 'last' } }, { id: 'asc' }],
      take: first + 1,
    });
    return rows.map(toCaseRow);
  }

  /** Komissiya dalil paketi: ish + signallar + hisobotlar + apellyatsiyalar. */
  async findCaseDetail(id: string): Promise<FairPlayCaseDetail | null> {
    const row = await this.prisma.fairPlayCase.findUnique({
      where: { id },
      include: {
        signals: { orderBy: { createdAt: 'asc' } },
        appeals: { orderBy: { createdAt: 'asc' } },
      },
    });
    if (row === null) {
      return null;
    }
    const reports = await this.prisma.fairPlayReport.findMany({
      where: { playerId: row.playerId },
      orderBy: [{ suspicionScore: { sort: 'desc', nulls: 'last' } }, { id: 'asc' }],
      take: 20,
    });
    return {
      case: toCaseRow(row),
      signals: row.signals.map(toSignalRow),
      appeals: row.appeals.map(toAppealRow),
      reports: reports.map(toReportRow),
    };
  }

  /** O'yinchining o'z ishlari (docs/08 §6.2 — bilish huquqi). */
  async listCasesForPlayer(playerId: string): Promise<FairPlayCaseRow[]> {
    const rows = await this.prisma.fairPlayCase.findMany({
      where: { playerId },
      orderBy: { createdAt: 'desc' },
    });
    return rows.map(toCaseRow);
  }

  /**
   * KOMISSIYA QARORI — sanctionUntil'ga tegadigan YAGONA yozuv yo'li.
   * actorUserId (odam) va rationale MAJBURIY — signaturada ham,
   * audit REASON_REQUIRED ro'yxatida ham ('fairplay.decision').
   *
   * Optimistik qulf: faqat OPEN/UNDER_REVIEW holatdan — parallel ikki
   * qaror bo'lsa bittasi yutadi, ikkinchisi null oladi (service 409).
   */
  async decideCase(input: DecideCaseInput): Promise<FairPlayCaseRow | null> {
    return await this.prisma.$transaction(async (tx) => {
      const before = await tx.fairPlayCase.findUnique({ where: { id: input.caseId } });
      if (before === null) {
        return null;
      }
      const updated = await tx.fairPlayCase.updateMany({
        where: { id: input.caseId, status: { in: ['OPEN', 'UNDER_REVIEW'] } },
        data: {
          status: input.decision,
          reviewedBy: input.actorUserId,
          reviewedAt: new Date(),
          decisionRationale: input.rationale,
          sanctionUntil: input.sanctionUntil,
        },
      });
      if (updated.count === 0) {
        return null;
      }

      await this.audit.write(tx, {
        action: 'fairplay.decision',
        actorUserId: input.actorUserId,
        resourceType: 'FairPlayCase',
        resourceId: input.caseId,
        reason: input.rationale,
        before: { status: before.status, sanctionUntil: before.sanctionUntil?.toISOString() ?? null },
        after: {
          status: input.decision,
          sanctionUntil: input.sanctionUntil?.toISOString() ?? null,
        },
      });

      const row = await tx.fairPlayCase.findUniqueOrThrow({ where: { id: input.caseId } });
      return toCaseRow(row);
    });
  }

  // --- Apellyatsiya -------------------------------------------------------------

  async createAppeal(input: {
    caseId: string;
    playerId: string;
    reason: string;
    actorUserId: string;
  }): Promise<AppealRow> {
    return await this.prisma.$transaction(async (tx) => {
      const appeal = await tx.appeal.create({
        data: {
          playerId: input.playerId,
          subjectType: 'FAIR_PLAY',
          subjectId: input.caseId,
          fairPlayCaseId: input.caseId,
          status: 'SUBMITTED',
          reason: input.reason,
        },
      });
      await this.audit.write(tx, {
        action: 'appeal.submitted',
        actorUserId: input.actorUserId,
        resourceType: 'Appeal',
        resourceId: appeal.id,
        after: { fairPlayCaseId: input.caseId, playerId: input.playerId },
      });
      return toAppealRow(appeal);
    });
  }

  async findAppealById(id: string): Promise<AppealRow | null> {
    const row = await this.prisma.appeal.findUnique({ where: { id } });
    return row === null ? null : toAppealRow(row);
  }

  async findActiveAppealForCase(caseId: string): Promise<AppealRow | null> {
    const row = await this.prisma.appeal.findFirst({
      where: { fairPlayCaseId: caseId, status: { in: ['SUBMITTED', 'UNDER_REVIEW'] } },
    });
    return row === null ? null : toAppealRow(row);
  }

  /**
   * Apellyatsiya qarori — ODAM qarori, yozma asos bilan (docs/08 §4.2
   * 5-band). UPHELD bo'lsa: ish APPEALED + sanksiya BEKOR — bu ham audit
   * bilan BIR tranzaksiyada (reyting tiklash — docs/08 §6.2 5-band,
   * rating moduli bilan keyingi bosqichda).
   */
  async decideAppeal(input: DecideAppealInput): Promise<AppealRow | null> {
    return await this.prisma.$transaction(async (tx) => {
      const appeal = await tx.appeal.findUnique({ where: { id: input.appealId } });
      if (appeal === null) {
        return null;
      }
      const updated = await tx.appeal.updateMany({
        where: { id: input.appealId, status: { in: ['SUBMITTED', 'UNDER_REVIEW'] } },
        data: {
          status: input.decision,
          decision: input.decisionText,
          reviewedBy: input.actorUserId,
          reviewedAt: new Date(),
        },
      });
      if (updated.count === 0) {
        return null;
      }

      let caseChange: { caseId: string; sanctionCleared: boolean } | null = null;
      if (input.decision === 'UPHELD' && appeal.fairPlayCaseId !== null) {
        const fpCase = await tx.fairPlayCase.findUnique({
          where: { id: appeal.fairPlayCaseId },
        });
        if (fpCase !== null) {
          await tx.fairPlayCase.update({
            where: { id: fpCase.id },
            data: { status: 'APPEALED', sanctionUntil: null },
          });
          caseChange = { caseId: fpCase.id, sanctionCleared: fpCase.sanctionUntil !== null };
        }
      }

      await this.audit.write(tx, {
        action: 'appeal.decision',
        actorUserId: input.actorUserId,
        resourceType: 'Appeal',
        resourceId: input.appealId,
        reason: input.decisionText,
        after: {
          status: input.decision,
          ...(caseChange !== null && { case: caseChange }),
        },
      });

      const row = await tx.appeal.findUniqueOrThrow({ where: { id: input.appealId } });
      return toAppealRow(row);
    });
  }
}

// --- Mapper'lar (Decimal → number, .toNumber() — rating.repository pattern'i) ---

function toCaseRow(c: FairPlayCase): FairPlayCaseRow {
  return {
    id: c.id,
    playerId: c.playerId,
    status: c.status,
    aggregateScore: c.aggregateScore?.toNumber() ?? null,
    reviewedBy: c.reviewedBy,
    reviewedAt: c.reviewedAt,
    decisionRationale: c.decisionRationale,
    sanctionUntil: c.sanctionUntil,
    createdAt: c.createdAt,
    updatedAt: c.updatedAt,
  };
}

function toSignalRow(s: FairPlaySignal): FairPlaySignalRow {
  return {
    id: s.id,
    caseId: s.caseId,
    type: s.type,
    strength: s.strength.toNumber(),
    evidence: s.evidence,
    createdAt: s.createdAt,
  };
}

function toReportRow(r: FairPlayReport): FairPlayReportRow {
  return {
    id: r.id,
    gameId: r.gameId,
    playerId: r.playerId,
    topMoveMatchRate: r.topMoveMatchRate?.toNumber() ?? null,
    avgCentipawnLoss: r.avgCentipawnLoss?.toNumber() ?? null,
    timingVariance: r.timingVariance?.toNumber() ?? null,
    suspicionScore: r.suspicionScore?.toNumber() ?? null,
    engineName: r.engineName,
    engineDepth: r.engineDepth,
    analysisMs: r.analysisMs,
    createdAt: r.createdAt,
  };
}

function toAppealRow(a: Appeal): AppealRow {
  return {
    id: a.id,
    playerId: a.playerId,
    subjectType: a.subjectType,
    subjectId: a.subjectId,
    fairPlayCaseId: a.fairPlayCaseId,
    status: a.status,
    reason: a.reason,
    reviewedBy: a.reviewedBy,
    reviewedAt: a.reviewedAt,
    decision: a.decision,
    createdAt: a.createdAt,
  };
}

/** Signal evidence'idan matn maydoni — dedupe kaliti (Json — himoya bilan o'qiladi). */
function evidenceField(evidence: unknown, key: string): string | null {
  if (typeof evidence === 'object' && evidence !== null && key in evidence) {
    const value = (evidence as Record<string, unknown>)[key];
    return typeof value === 'string' ? value : null;
  }
  return null;
}
