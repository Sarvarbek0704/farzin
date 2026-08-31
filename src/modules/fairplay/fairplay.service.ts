import { Inject, Injectable, Logger } from '@nestjs/common';
import { Queue } from 'bullmq';

import { BusinessRuleError, ConflictError, NotFoundError } from '../../core/errors/domain.error';
import {
  DEFAULT_PAGE_SIZE,
  decodeCursor,
  MAX_PAGE_SIZE,
  type Page,
  toPage,
} from '../../shared/pagination/cursor';
import {
  FAIRPLAY_ANALYZE_JOB,
  FAIRPLAY_QUEUE,
  type FairplayAnalyzeJobData,
} from '../../shared/queue/queue.module';
import { type Actor, RbacService } from '../identity/rbac.port';
import { PLAYER_PORT, type PlayerPort } from '../player/player.port';
import { FairplayRepository } from './fairplay.repository';
import type {
  AppealDecisionValue,
  AppealRow,
  CaseDecisionValue,
  FairPlayCaseDetail,
  FairPlayCaseOwnView,
  FairPlayCaseRow,
} from './fairplay.types';

/**
 * Fairplay servisi — hisobot, ish, qaror, apellyatsiya (docs/08-fair-play.md).
 *
 * ═══════════════════════════════════════════════════════════════════════════
 *  KANON (docs/08 §0, §4.1; CANON §7.5): TIZIM EHTIMOLLIK BERADI, ISBOT EMAS.
 *
 *  Sanksiya o'rnatadigan YAGONA yo'l — decideCase: autentifikatsiyalangan
 *  ODAM aktori + MAJBURIY yozma asos (rationale) + audit. Signal, skor
 *  yoki chegara hech qachon o'zi jazo bermaydi — bunday kod yo'li YO'Q.
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * KIRISH HUQUQI (docs/08 §6.3 + docs/01 §4.1 matritsasi):
 *  - Komissiya ro'yxati/dalili: scope'siz `FairPlayCase read` — amalda
 *    SUPER_ADMIN (global) va FEDERATION_ADMIN (yulduqchasiz R) o'tadi.
 *  - ARBITER matritsada R* (scoped) — FairPlayCase↔Tournament bog'lanishi
 *    schema'da YO'Q, shuning uchun arbiter komissiya ro'yxatini hozircha
 *    KO'RMAYDI (deny→404). Bog'lanish qo'shilganda scope tekshiruvi shu
 *    yerda kengayadi — HUJJATLANGAN qaror.
 *  - CLUB_ADMIN'da FairPlayCase granti UMUMAN yo'q (bosim vektori) —
 *    guard darajasida 404.
 *  - O'yinchi faqat O'Z ishlarini cheklangan ko'rinishda ko'radi
 *    (my-cases): skor/signal detali oshkor qilinmaydi (docs/08:
 *    "aniq chegaralar oshkor qilinmaydi").
 *
 * Deny→404 hamma joyda (docs/04 §2.4): ruxsat yo'qligi resurs mavjudligini
 * oshkor qilmaydi.
 */

/** Yozma asos minimal uzunligi — "ha" yoki "aybdor" asos emas. */
export const MIN_RATIONALE_LENGTH = 20;

/**
 * MANUAL_REPORT signal kuchi — o'lchov emas, "odam shubhalandi" belgisi.
 * 0.5 tanlangan: aggregatsiyada e'tibor beradi, yolg'iz o'zi default
 * chegarani (0.6 renormallashtirilganda ham 0.5) OSHIRMAYDI — shikoyat
 * o'z-o'zidan ish ustuvorligini portlatmaydi. Kalibrlashda qayta ko'riladi.
 */
export const MANUAL_REPORT_STRENGTH = 0.5;

/** Apellyatsiya oynasi — docs/08 §4.2: qaror chiqqach 30 kun. */
export const APPEAL_WINDOW_DAYS = 30;

export interface SubmitReportInput {
  gameId: string;
  reason: string;
  suspectPlayerId?: string | undefined;
}

export interface DecideCaseInput {
  decision: CaseDecisionValue;
  rationale?: string | undefined;
  sanctionUntil?: string | undefined;
}

export interface DecideAppealInput {
  status: AppealDecisionValue;
  decision?: string | undefined;
}

@Injectable()
export class FairplayService {
  private readonly logger = new Logger(FairplayService.name);

  constructor(
    private readonly repo: FairplayRepository,
    private readonly rbac: RbacService,
    @Inject(PLAYER_PORT) private readonly players: PlayerPort,
    @Inject(FAIRPLAY_QUEUE) private readonly queue: Queue,
  ) {}

  // --- Manual report (docs/08 §7.4 3-band, §3.3 Bosqich 1) ----------------------

  /**
   * Odam shikoyati: MANUAL_REPORT signal + ishga qo'shish (yo ochish) +
   * tahlil navbatga HAR DOIM qo'yiladi (tanlab tahlildan farqli —
   * shikoyat bor joyda odam so'ragan).
   *
   * Javobda ish ID'si YO'Q — ayblanuvchi ham, shikoyatchi ham ish
   * mavjudligini bilmasligi kerak (docs/08 §4.2 3-band: bu bosqichgacha
   * o'yinchi hech narsa bilmaydi).
   */
  async submitReport(actor: Actor, input: SubmitReportInput): Promise<{ received: true }> {
    const game = await this.repo.findGameBasic(input.gameId);
    if (game === null) {
      throw new NotFoundError('OnlineGame', input.gameId);
    }

    const me = await this.players.findSummaryByUserId(actor.userId);
    const participants = [game.whitePlayerId, game.blackPlayerId];

    let suspectId: string;
    if (input.suspectPlayerId !== undefined) {
      if (!participants.includes(input.suspectPlayerId)) {
        throw new BusinessRuleError(
          'SUSPECT_NOT_IN_GAME',
          "Ko'rsatilgan o'yinchi bu o'yinning ishtirokchisi emas",
          { gameId: input.gameId },
        );
      }
      suspectId = input.suspectPlayerId;
    } else if (me !== null && participants.includes(me.id)) {
      // O'yin ishtirokchisi shikoyat qildi — gumon RAQIBGA.
      suspectId = me.id === game.whitePlayerId ? game.blackPlayerId : game.whitePlayerId;
    } else {
      throw new BusinessRuleError(
        'SUSPECT_REQUIRED',
        "Siz bu o'yinning ishtirokchisi emassiz — suspectPlayerId ko'rsating",
        { gameId: input.gameId },
      );
    }

    if (me !== null && me.id === suspectId) {
      throw new BusinessRuleError('SELF_REPORT', "O'zingiz ustingizdan shikoyat qila olmaysiz");
    }

    await this.repo.recordSignals({
      playerId: suspectId,
      gameId: game.id,
      signals: [
        {
          type: 'MANUAL_REPORT',
          strength: MANUAL_REPORT_STRENGTH,
          evidence: {
            gameId: game.id,
            reporterUserId: actor.userId,
            reason: input.reason.trim(),
          },
        },
      ],
      actorUserId: actor.userId,
      auditAction: 'fairplay.reported',
    });

    // Shikoyat → tahlil HAR DOIM navbatga (sampling'siz).
    await this.enqueueAnalysis({ gameId: game.id, playerId: suspectId });

    return { received: true };
  }

  /** Navbatga qo'yish — jobId bilan dedupe (parallel shikoyatlar bitta job). */
  private async enqueueAnalysis(data: FairplayAnalyzeJobData): Promise<void> {
    await this.queue.add(FAIRPLAY_ANALYZE_JOB, data, {
      jobId: `analyze:${data.gameId}:${data.playerId ?? 'all'}`,
    });
  }

  // --- Komissiya (docs/08 §4.2) --------------------------------------------------

  /** Navbat — aggregateScore DESC: komissiya vaqti eng shubhali ishga. */
  async listCases(
    actor: Actor,
    query: { first?: number | undefined; after?: string | undefined },
  ): Promise<Page<FairPlayCaseRow>> {
    this.requireCommission(actor);
    const pageSize = Math.min(Math.max(query.first ?? DEFAULT_PAGE_SIZE, 1), MAX_PAGE_SIZE);
    const afterId = query.after !== undefined ? decodeCursor(query.after) : null;
    const rows = await this.repo.listCases(pageSize, afterId);
    return toPage(rows, pageSize);
  }

  /** Ish + dalillar (signal, hisobot, apellyatsiya) — komissiya paketi. */
  async getCaseDetail(actor: Actor, caseId: string): Promise<FairPlayCaseDetail> {
    this.requireCommission(actor);
    const detail = await this.repo.findCaseDetail(caseId);
    if (detail === null) {
      throw new NotFoundError('FairPlayCase', caseId);
    }
    return detail;
  }

  /**
   * KOMISSIYA QARORI — tizimdagi sanksiyaga olib boradigan YAGONA yo'l.
   *
   * Talablar (docs/08 §4, docs/14 Faza 6 "Majburiy sabab yozish"):
   *  - aktor — ODAM (JWT autentifikatsiya + FairPlayCase update huquqi,
   *    matritsada faqat SUPER_ADMIN);
   *  - rationale MAJBURIY, ≥ MIN_RATIONALE_LENGTH — DTO emas, service
   *    422 beradi (RFC 9457 BusinessRuleError);
   *  - sanctionUntil FAQAT CLOSED_SANCTION bilan va faqat kelajakda —
   *    doimiy ban YO'Q (docs/08 §4.3: doimiy ro'yxatda yo'q; muddat
   *    majburiy);
   *  - hammasi audit'da 'fairplay.decision' (REASON_REQUIRED ro'yxatida).
   */
  async decideCase(actor: Actor, caseId: string, input: DecideCaseInput): Promise<FairPlayCaseRow> {
    const existing = await this.repo.findCaseById(caseId);
    if (existing === null) {
      throw new NotFoundError('FairPlayCase', caseId);
    }
    if (!this.rbac.can(actor, 'update', { type: 'FairPlayCase' })) {
      throw new NotFoundError('FairPlayCase', caseId);
    }

    const rationale = input.rationale?.trim() ?? '';
    if (rationale.length < MIN_RATIONALE_LENGTH) {
      throw new BusinessRuleError(
        'RATIONALE_REQUIRED',
        `Qaror uchun yozma asos MAJBURIY (kamida ${String(MIN_RATIONALE_LENGTH)} belgi) — bu odamning karyerasi haqida (docs/08 §4)`,
        { caseId },
      );
    }

    let sanctionUntil: Date | null = null;
    if (input.decision === 'CLOSED_SANCTION') {
      if (input.sanctionUntil === undefined) {
        throw new BusinessRuleError(
          'SANCTION_UNTIL_REQUIRED',
          "CLOSED_SANCTION muddat bilan keladi — doimiy ban YO'Q (docs/08 §4.3)",
          { caseId },
        );
      }
      sanctionUntil = new Date(input.sanctionUntil);
      if (Number.isNaN(sanctionUntil.getTime()) || sanctionUntil <= new Date()) {
        throw new BusinessRuleError(
          'SANCTION_UNTIL_INVALID',
          "sanctionUntil kelajakdagi sana bo'lishi kerak",
          { caseId },
        );
      }
    } else if (input.sanctionUntil !== undefined) {
      throw new BusinessRuleError(
        'SANCTION_WITHOUT_SANCTION_DECISION',
        'sanctionUntil faqat CLOSED_SANCTION qarori bilan beriladi',
        { caseId },
      );
    }

    const decided = await this.repo.decideCase({
      caseId,
      decision: input.decision,
      rationale,
      sanctionUntil,
      actorUserId: actor.userId,
    });
    if (decided === null) {
      throw new ConflictError('Ish allaqachon hal qilingan — qaror bir marta chiqadi', { caseId });
    }
    return decided;
  }

  // --- O'yinchi ko'rinishi (docs/08 §6.2) ----------------------------------------

  /**
   * O'z ishlari — CHEKLANGAN ko'rinish: status, qaror asosi, sanksiya.
   * Skor, signal turlari, chegara qiymatlari OSHKOR QILINMAYDI
   * (docs/14 Faza 6: "aniq chegaralar yo'q" — teskari muhandislik himoyasi).
   */
  async listMyCases(actor: Actor): Promise<FairPlayCaseOwnView[]> {
    const me = await this.players.findSummaryByUserId(actor.userId);
    if (me === null) {
      return [];
    }
    const rows = await this.repo.listCasesForPlayer(me.id);
    return rows.map(toOwnView);
  }

  // --- Apellyatsiya (docs/08 §4.2 5-band, §6.2 4-band) ---------------------------

  /** O'yinchi o'z ishi bo'yicha apellyatsiya beradi — 30 kun oynada. */
  async submitAppeal(actor: Actor, caseId: string, reason: string): Promise<AppealRow> {
    const fpCase = await this.repo.findCaseById(caseId);
    if (fpCase === null) {
      throw new NotFoundError('FairPlayCase', caseId);
    }

    const me = await this.players.findSummaryByUserId(actor.userId);
    const isOwn = me !== null && me.id === fpCase.playerId;
    // O'z ishi — yoki global Appeal-create huquqi (amalda SUPER_ADMIN,
    // o'yinchi nomidan rasmiylashtirish uchun).
    if (!isOwn && !this.rbac.can(actor, 'create', { type: 'Appeal' })) {
      throw new NotFoundError('FairPlayCase', caseId);
    }

    if (fpCase.status !== 'CLOSED_WARNING' && fpCase.status !== 'CLOSED_SANCTION') {
      throw new BusinessRuleError(
        'APPEAL_NOT_AVAILABLE',
        "Apellyatsiya faqat qaror chiqqan ish bo'yicha beriladi",
        { caseId, status: fpCase.status },
      );
    }
    if (fpCase.reviewedAt !== null) {
      const deadline = new Date(fpCase.reviewedAt.getTime() + APPEAL_WINDOW_DAYS * 24 * 3_600_000);
      if (new Date() > deadline) {
        throw new BusinessRuleError(
          'APPEAL_WINDOW_CLOSED',
          `Apellyatsiya muddati o'tgan (${String(APPEAL_WINDOW_DAYS)} kun — docs/08 §4.2)`,
          { caseId, deadline: deadline.toISOString() },
        );
      }
    }
    const active = await this.repo.findActiveAppealForCase(caseId);
    if (active !== null) {
      throw new ConflictError("Bu ish bo'yicha ochiq apellyatsiya allaqachon bor", {
        caseId,
        appealId: active.id,
      });
    }

    return await this.repo.createAppeal({
      caseId,
      playerId: fpCase.playerId,
      reason: reason.trim(),
      actorUserId: actor.userId,
    });
  }

  async getAppeal(actor: Actor, appealId: string): Promise<AppealRow> {
    const appeal = await this.repo.findAppealById(appealId);
    if (appeal === null) {
      throw new NotFoundError('Appeal', appealId);
    }
    const me = await this.players.findSummaryByUserId(actor.userId);
    const isOwn = me !== null && me.id === appeal.playerId;
    if (!isOwn && !this.rbac.can(actor, 'read', { type: 'Appeal' })) {
      throw new NotFoundError('Appeal', appealId);
    }
    return appeal;
  }

  /**
   * Apellyatsiya qarori — BOSHQA TARKIB ko'radi (docs/08 §4.2 5-band:
   * "Birinchi qarorda qatnashgan odam apellyatsiyani ko'rmaydi") —
   * kod darajasida majburlanadi (APPEAL_SAME_REVIEWER).
   *
   * UPHELD + sanksiyali ish → ish APPEALED, sanksiya BEKOR (odam qarori,
   * audit bilan). Reyting tiklash (docs/08 §6.2 5-band) — rating moduli
   * bilan keyingi bosqich (TODO hujjatlangan).
   *
   * Matritsa: Appeal update — SUPER_ADMIN global; ARBITER U* turnir-scoped
   * (fair-play ishida turnir bog'lanishi yo'q → amalda qatnashmaydi —
   * hujjatlangan semantika).
   */
  async decideAppeal(actor: Actor, appealId: string, input: DecideAppealInput): Promise<AppealRow> {
    const appeal = await this.repo.findAppealById(appealId);
    if (appeal === null) {
      throw new NotFoundError('Appeal', appealId);
    }
    if (!this.rbac.can(actor, 'update', { type: 'Appeal' })) {
      throw new NotFoundError('Appeal', appealId);
    }

    const decisionText = input.decision?.trim() ?? '';
    if (decisionText.length < MIN_RATIONALE_LENGTH) {
      throw new BusinessRuleError(
        'APPEAL_DECISION_TEXT_REQUIRED',
        `Apellyatsiya qarori yozma asos bilan chiqadi (kamida ${String(MIN_RATIONALE_LENGTH)} belgi)`,
        { appealId },
      );
    }

    if (appeal.fairPlayCaseId !== null) {
      const fpCase = await this.repo.findCaseById(appeal.fairPlayCaseId);
      if (fpCase?.reviewedBy === actor.userId) {
        throw new BusinessRuleError(
          'APPEAL_SAME_REVIEWER',
          "Apellyatsiyani birinchi qarorni chiqargan odam ko'ra olmaydi (docs/08 §4.2)",
          { appealId },
        );
      }
    }

    const decided = await this.repo.decideAppeal({
      appealId,
      decision: input.status,
      decisionText,
      actorUserId: actor.userId,
    });
    if (decided === null) {
      throw new ConflictError('Apellyatsiya allaqachon hal qilingan', { appealId });
    }
    this.logger.log(`appeal.decision: ${appealId} → ${input.status}`);
    return decided;
  }

  // --- Yordamchilar ---------------------------------------------------------------

  /** Komissiya = scope'siz FairPlayCase read (SUPER_ADMIN, FEDERATION_ADMIN — §6.3). */
  private requireCommission(actor: Actor): void {
    if (!this.rbac.can(actor, 'read', { type: 'FairPlayCase' })) {
      throw new NotFoundError('FairPlayCase');
    }
  }
}

function toOwnView(row: FairPlayCaseRow): FairPlayCaseOwnView {
  return {
    id: row.id,
    status: row.status,
    decisionRationale: row.decisionRationale,
    sanctionUntil: row.sanctionUntil,
    createdAt: row.createdAt,
    reviewedAt: row.reviewedAt,
  };
}
