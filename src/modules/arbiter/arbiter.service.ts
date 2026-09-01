import { Injectable, Logger } from '@nestjs/common';

import { BusinessRuleError, ConflictError, NotFoundError } from '../../core/errors/domain.error';
import { writeSectionPgn } from '../../core/export/pgn-writer';
import { writePairingSheetPdf, writeStandingsPdf } from '../../core/export/pdf-writer';
import { writeSectionTrf } from '../../core/export/trf-writer';
import { RoundRobinEngine } from '../../core/pairing/round-robin.engine';
import { PairingIntegrityError, SwissDutchEngine } from '../../core/pairing/swiss-dutch.engine';
import {
  PairingImpossibleError,
  type PairingResult as EnginePairingResult,
  type RoundId,
} from '../../core/pairing/pairing.types';
import { pairingAlgorithmLabel } from '../../shared/metrics/metrics.labels';
import { MetricsService } from '../../shared/metrics/metrics.service';
import { TieBreakCalculator } from '../../core/tiebreak/tiebreak.calculator';
import {
  TIE_BREAK_KEYS,
  type PlayerTieBreakInput,
  type TieBreakKey,
} from '../../core/tiebreak/tiebreak.types';
import { type Actor, RbacService } from '../identity/rbac.port';
import {
  ArbiterRepository,
  type PairingRow,
  type ParticipantRow,
  type RoundRow,
  type RoundWithPairings,
  type SectionContextRow,
  type StandingRow,
  type UpsertStandingInput,
} from './arbiter.repository';
import {
  BYE_RESULTS,
  DEFAULT_TIE_BREAK_ORDER,
  type EnterableResult,
  type ParticipantSeed,
} from './arbiter.types';
import { buildSectionExportData, exportFilename } from './export-mapping';
import { buildPairingStates } from './pairing-state.builder';
import { buildScoreViews } from './result-mapping';

/** Yuklab olinadigan eksport fayli (controller Content-Disposition uchun). */
export interface ExportFile {
  readonly filename: string;
  readonly content: string;
}

/** Binar eksport (PDF) — matnli ExportFile dan alohida. */
export interface ExportBinaryFile {
  readonly filename: string;
  readonly content: Buffer;
}

/**
 * Arbiter — hakam ish oqimi: tur generatsiyasi (round-robin), natija
 * kiritish, tur yakuni, jadval + tie-break. [CANON 5] #7,
 * docs/14-roadmap.md Faza 1 ("hakam Excel'siz turnir o'tkaza olsin").
 *
 * Ruxsat modeli: har yozuv amali uchun aktor — shu turnirga biriktirilgan
 * hakam (TournamentArbiter qatori) YOKI turnirni boshqara oladigan rol
 * (rbac.can 'update' Tournament — tashkilotchi/klub-viloyat-federatsiya
 * admini/SUPER_ADMIN). Ruxsat yo'q → 404, hech qachon 403
 * (docs/04-api-spec.md §2.4).
 *
 * Seksiyani boshlash BU MODULNIKI EMAS — turnir holat mashinasi
 * (tournament moduli) IN_PROGRESS'ga o'tkazadi; bu yerda faqat
 * "turnir IN_PROGRESS bo'lishi shart" sharti tekshiriladi.
 */
@Injectable()
export class ArbiterService {
  private readonly logger = new Logger(ArbiterService.name);

  /**
   * Engine'lar deterministik va holatsiz — bitta nusxa yetadi.
   * DOUBLE_ROUND_ROBIN — alohida engine emas, `legs: 2` konfiguratsiyasi
   * (docs/05-pairing-engine.md §1.3).
   *
   * ⚠️ SWISS_DUTCH validatsiya holati (halol bayon, TZ Faza 2 DoD):
   * property-testlar + qo'lda hisoblangan golden ssenariylar bilan
   * tekshirilgan, lekin Swiss-Manager/JaVaFo bilan real turnirlarda HALI
   * solishtirilmagan. Jiddiy turnirlarda ishonishdan oldin shadow-mode
   * (mavjud vosita bilan parallel yurgizib solishtirish) o'tkazilsin —
   * core/pairing/swiss-dutch.engine.ts sarlavhasi va ADR-0009.
   */
  private readonly engines = {
    ROUND_ROBIN: new RoundRobinEngine(),
    DOUBLE_ROUND_ROBIN: new RoundRobinEngine({ legs: 2 }),
    SWISS_DUTCH: new SwissDutchEngine(),
  } as const;

  private readonly tieBreaks = new TieBreakCalculator();

  constructor(
    private readonly repo: ArbiterRepository,
    private readonly rbac: RbacService,
    private readonly metrics: MetricsService,
  ) {}

  // --- Tur generatsiyasi ------------------------------------------------------

  /**
   * Keyingi turni generatsiya qilish (docs/04-api-spec.md §… `:generate`
   * custom method semantikasi — resurs yaratish emas, HARAKAT).
   *
   * Qoidalar:
   *  - turnir IN_PROGRESS bo'lishi shart;
   *  - seksiya ROUND_ROBIN, DOUBLE_ROUND_ROBIN yoki SWISS_DUTCH
   *    (KNOCKOUT/SCHEVENINGEN/TEAM_SWISS — keyingi fazalar);
   *  - oldingi tur (bo'lsa) COMPLETED bo'lishi shart;
   *  - raqamlar hali berilmagan bo'lsa — avval assignPairingNumbers;
   *  - jadval tugagan bo'lsa engine PairingImpossibleError beradi →
   *    BusinessRuleError('PAIRING_IMPOSSIBLE') ga o'giriladi (u DomainError
   *    emas — global filtrga 500 bo'lib tushmasin).
   */
  async generateRound(actor: Actor, sectionId: string): Promise<RoundWithPairings> {
    const section = await this.requireSection(sectionId, 'Round');
    await this.assertManageAccess(actor, section, 'Round');
    this.assertTournamentInProgress(section);

    if (
      section.pairingSystem !== 'ROUND_ROBIN' &&
      section.pairingSystem !== 'DOUBLE_ROUND_ROBIN' &&
      section.pairingSystem !== 'SWISS_DUTCH'
    ) {
      throw new BusinessRuleError(
        'PAIRING_SYSTEM_NOT_IMPLEMENTED',
        `${section.pairingSystem} juftlashtirish hali yo'q — keyingi fazalarda (docs/14-roadmap.md)`,
        { pairingSystem: section.pairingSystem },
      );
    }

    const latest = await this.repo.latestRound(sectionId);
    if (latest !== null && latest.status !== 'COMPLETED') {
      throw new BusinessRuleError(
        'PREVIOUS_ROUND_NOT_COMPLETED',
        'Oldingi tur yakunlanmagan — avval barcha natijalar kiritilib, tur yopilsin',
        { roundId: latest.id, number: latest.number, status: latest.status },
      );
    }
    const nextNumber = (latest?.number ?? 0) + 1;

    // Raqamlar berilmagan bo'lsa — birinchi tur oldidan bir marta beriladi
    // va TURNIR DAVOMIDA O'ZGARMAYDI (docs/05-pairing-engine.md §2).
    const active = await this.repo.activeRegistrations(sectionId);
    if (active.every((r) => r.pairingNumber === null)) {
      await this.repo.assignPairingNumbers(sectionId, actor.userId);
    }
    const participants = await this.repo.numberedRegistrations(sectionId);

    const history = await this.repo.completedPairingsForSection(sectionId);
    const players = buildPairingStates(toSeeds(participants), history);

    const engine = this.engines[section.pairingSystem];

    // ── Kuzatuvchanlik (docs/15-observability.md §3.3 PAIRING) ────────────
    // Vaqt SHU YERDA o'lchanadi, dvigatel ichida emas: core/ sof qoladi
    // (ADR-0001, arch:check `core-must-stay-pure`). Yorliqlar — algoritm
    // va o'yinchi soni GURUHI; `sectionId` metrikaga TUSHMAYDI (§3.4).
    const algorithm = pairingAlgorithmLabel(section.pairingSystem);
    const sectionSize = players.length;

    const startedAt = Date.now();
    let engineResult: EnginePairingResult;
    try {
      engineResult = await engine.pair({
        // Round hali yaratilmagan — brand ostida diagnostik identifikator.
        roundId: `${sectionId}#${String(nextNumber)}` as RoundId,
        roundNumber: nextNumber,
        totalRounds: section.totalRounds,
        players,
      });
    } catch (error) {
      if (error instanceof PairingImpossibleError) {
        // KUTILGAN holat (hakam qo'lda aralashadi), bug emas.
        this.metrics.incPairingFailure({ algorithm, reason: 'NO_VALID_PAIRING' });
        throw new BusinessRuleError('PAIRING_IMPOSSIBLE', error.message, {
          sectionId,
          roundNumber: nextNumber,
        });
      }
      if (error instanceof PairingIntegrityError) {
        // ⚠️  JIMGINA HALOKAT (docs/15 §0): natija chiqdi-yu FIDE C.04.3
        //     absolyut talabini buzdi. Bu counter > 0 bo'lsa alert
        //     turnirni TO'XTATISHGA chaqiradi (§6.4).
        this.metrics.incPairingFailure({ algorithm, reason: 'ABSOLUTE_CRITERIA_VIOLATION' });
        this.metrics.incCriteriaViolation({ criterion: error.criterion });
        throw error;
      }
      this.metrics.incPairingFailure({ algorithm, reason: 'UNEXPECTED' });
      throw error;
    }
    const durationMs = Date.now() - startedAt;
    this.metrics.observePairingDuration(durationMs / 1000, { algorithm, sectionSize });
    if (engineResult.diagnostics !== undefined) {
      // Float soni — SIFAT signali (§3.3): xato emas, lekin o'sib borsa
      // juftlashtirish sifati pasayayotganini bildiradi.
      this.metrics.observePairingFloatCount(engineResult.diagnostics.floatCount, { sectionSize });
    }

    // Bye — Pairing qatori sifatida: blackRegistrationId NULL, natija
    // darhol BYE_FULL (PAB = 1 ochko, pairing.types.ts ByeType izohi).
    const boards = [
      ...engineResult.pairings.map((p) => ({
        boardNumber: p.boardNumber,
        whiteRegistrationId: String(p.whitePlayerId),
        blackRegistrationId: String(p.blackPlayerId),
        result: 'UNPLAYED' as const,
      })),
      ...engineResult.byes.map((bye, index) => ({
        boardNumber: engineResult.pairings.length + index + 1,
        whiteRegistrationId: String(bye.playerId),
        blackRegistrationId: null,
        result: 'BYE_FULL' as const,
      })),
    ];

    const round = await this.repo.createRoundWithPairings(
      {
        sectionId,
        number: nextNumber,
        engineVersion: engineResult.engineVersion,
        durationMs,
        boards,
      },
      actor.userId,
    );

    // Bye darhol ochko beradi — jadval yangilansin (docs/14-roadmap.md
    // Faza 1: "jadval real vaqtda yangilanadi").
    await this.recomputeStandings(section);

    return round;
  }

  // --- Natija kiritish ---------------------------------------------------------

  /**
   * Natija kiritish yoki tuzatish.
   *
   * Qoidalar:
   *  - bye juftligiga faqat BYE_* natija, oddiy juftlikka BYE_* mumkin emas;
   *  - mavjud (UNPLAYED bo'lmagan) natijani O'ZGARTIRISH — sabab MAJBURIY
   *    (docs/14-roadmap.md Faza 1: "natijani o'zgartirish — majburiy sabab
   *    + audit log"); birinchi kiritishga sabab shart emas;
   *  - har kiritishdan keyin jadval qayta hisoblanadi.
   */
  async enterResult(
    actor: Actor,
    pairingId: string,
    result: EnterableResult,
    reason?: string,
  ): Promise<PairingRow> {
    const pairing = await this.repo.findPairingContext(pairingId);
    if (pairing === null) {
      throw new NotFoundError('Pairing', pairingId);
    }
    const section = await this.requireSection(pairing.sectionId, 'Pairing', pairingId);
    await this.assertManageAccess(actor, section, 'Pairing', pairingId);
    this.assertTournamentInProgress(section);

    const isBye = pairing.blackRegistrationId === null;
    const isByeResult = (BYE_RESULTS as readonly string[]).includes(result);
    if (isBye !== isByeResult) {
      throw new BusinessRuleError(
        'RESULT_NOT_APPLICABLE',
        isBye
          ? 'Bye juftligiga faqat BYE_FULL/BYE_HALF/BYE_ZERO natija kiritiladi'
          : 'Oddiy juftlikka bye natijasi kiritilmaydi',
        { pairingId, result, isBye },
      );
    }

    const trimmedReason = reason?.trim();
    const isCorrection = pairing.result !== 'UNPLAYED';
    if (isCorrection && (trimmedReason === undefined || trimmedReason === '')) {
      throw new BusinessRuleError(
        'RESULT_CHANGE_REASON_REQUIRED',
        "Mavjud natijani o'zgartirish uchun sabab majburiy — audit logga yoziladi",
        { pairingId, currentResult: pairing.result },
      );
    }

    const updated = await this.repo.enterResult(
      pairingId,
      result,
      actor.userId,
      trimmedReason !== undefined && trimmedReason !== '' ? trimmedReason : null,
    );

    await this.recomputeStandings(section);
    return updated;
  }

  // --- Tur yakuni ---------------------------------------------------------------

  /**
   * Turni yakunlash: barcha juftliklarda natija bo'lishi shart. Yakun
   * repository'da outbox `RoundCompleted` + audit bilan atomik.
   */
  async completeRound(actor: Actor, roundId: string): Promise<RoundWithPairings> {
    const round = await this.repo.findRound(roundId);
    if (round === null) {
      throw new NotFoundError('Round', roundId);
    }
    const section = await this.requireSection(round.sectionId, 'Round', roundId);
    await this.assertManageAccess(actor, section, 'Round', roundId);
    this.assertTournamentInProgress(section);

    if (round.status === 'COMPLETED') {
      throw new ConflictError('Tur allaqachon yakunlangan', { roundId });
    }

    const unplayedBoards = round.pairings
      .filter((p) => p.result === 'UNPLAYED')
      .map((p) => p.boardNumber);
    if (unplayedBoards.length > 0) {
      throw new BusinessRuleError(
        'ROUND_HAS_UNPLAYED_GAMES',
        'Turda natijasi kiritilmagan taxtalar bor — tur yopilmaydi',
        { roundId, boards: unplayedBoards },
      );
    }

    const completed = await this.repo.completeRound(roundId, actor.userId);
    await this.recomputeStandings(section);
    return completed;
  }

  // --- Ommaviy o'qishlar ---------------------------------------------------------

  /** Turlar ro'yxati — ommaviy; yashirin/DRAFT turnirniki ko'rinmaydi. */
  async listRounds(sectionId: string): Promise<RoundRow[]> {
    await this.requirePublicSection(sectionId);
    return await this.repo.listRounds(sectionId);
  }

  /** Tur + juftliklar — ommaviy ko'rinish. */
  async getRound(roundId: string): Promise<RoundWithPairings> {
    const round = await this.repo.findRound(roundId);
    if (round === null) {
      throw new NotFoundError('Round', roundId);
    }
    const section = await this.repo.findSectionWithTournament(round.sectionId);
    if (section === null || !section.tournament.isPublic || section.tournament.status === 'DRAFT') {
      throw new NotFoundError('Round', roundId);
    }
    return round;
  }

  /** Jadval (standings) — ommaviy, rank tartibida. */
  async getStandings(sectionId: string): Promise<StandingRow[]> {
    await this.requirePublicSection(sectionId);
    return await this.repo.getStandings(sectionId);
  }

  // --- Eksport (docs/14-roadmap.md Faza 1 "Eksport") -----------------------------

  /**
   * PGN eksport — seksiyaning barcha o'ynalgan partiyalari bitta faylda.
   * Ommaviy o'qish: boshqa ommaviy o'qishlar bilan bir xil qoida
   * (yashirin/DRAFT turnir → 404, mavjudligi oshkor qilinmaydi).
   */
  async exportPgn(sectionId: string): Promise<ExportFile> {
    const section = await this.requirePublicSection(sectionId);
    const rows = await this.repo.sectionExportData(sectionId);
    return {
      filename: exportFilename(section, 'pgn'),
      content: writeSectionPgn(buildSectionExportData(section, rows)),
    };
  }

  /**
   * FIDE TRF16 eksport — Chess-Results / Swiss-Manager import qiladigan
   * format ("migratsiya yo'li", docs/14-roadmap.md Faza 1). Ommaviy.
   */
  async exportTrf(sectionId: string): Promise<ExportFile> {
    const section = await this.requirePublicSection(sectionId);
    const rows = await this.repo.sectionExportData(sectionId);
    return {
      filename: exportFilename(section, 'trf'),
      content: writeSectionTrf(buildSectionExportData(section, rows)),
    };
  }

  /**
   * Juftlik varaqasi PDF — bir tur uchun, BOSIB CHIQARISHGA mo'ljallangan.
   *
   * docs/14-roadmap.md Faza 1 "Eksport": "PDF juftlik varaqasi bosib
   * chiqarishga yaroqli". Bu offline degradatsiya rejasining bir qismi
   * (docs/11 §12.4): zalda internet uzilsa hakam qog'oz bilan davom etadi.
   */
  async exportPairingSheetPdf(sectionId: string, roundNumber: number): Promise<ExportBinaryFile> {
    const section = await this.requirePublicSection(sectionId);
    const rows = await this.repo.sectionExportData(sectionId);
    const data = buildSectionExportData(section, rows);

    if (!data.rounds.some((r) => r.number === roundNumber)) {
      // Sof yozuvchi Error tashlaydi; bu yerda domen xatosiga o'giramiz,
      // aks holda global filtr uni 500 qilardi.
      throw new NotFoundError('Round', String(roundNumber));
    }

    return {
      filename: exportFilename(section, 'pdf').replace(/.pdf$/, `-${String(roundNumber)}-tur.pdf`),
      content: await writePairingSheetPdf(data, roundNumber),
    };
  }

  /** Jadval PDF — joriy holat, bosib chiqarishga mo'ljallangan. */
  async exportStandingsPdf(sectionId: string): Promise<ExportBinaryFile> {
    const section = await this.requirePublicSection(sectionId);
    const rows = await this.repo.sectionExportData(sectionId);
    return {
      filename: exportFilename(section, 'pdf').replace(/.pdf$/, '-jadval.pdf'),
      content: await writeStandingsPdf(buildSectionExportData(section, rows)),
    };
  }

  // --- Jadval hisoblash -----------------------------------------------------------

  /**
   * Jadvalni to'liq qayta hisoblash: Pairing.result (haqiqat manbai) →
   * ochko/statistika (result-mapping.ts) → tie-break (core/tiebreak) →
   * Standing upsert. Har natija o'zgarishidan keyin chaqiriladi —
   * docs/14-roadmap.md Faza 1 "jadval real vaqtda yangilanadi" (polling).
   */
  private async recomputeStandings(section: SectionContextRow): Promise<void> {
    const participants = await this.repo.numberedRegistrations(section.id);
    if (participants.length === 0) {
      return;
    }

    const history = await this.repo.completedPairingsForSection(section.id);
    const views = buildScoreViews(
      participants.map((p) => p.id),
      history,
    );

    // Float tarixi — `buildPairingStates` FIDE C.04.3 Article 1.4 bo'yicha
    // hisoblaydi (juftlashtirishda ishlatiladigan AYNAN o'sha kod).
    //
    // ⚠️  Ilgari bu yerda `floatHistory: []` qattiq yozilgan edi, izohda esa
    //     "round-robin'da float yo'q" deyilgan — lekin bu metod SWISS_DUTCH
    //     seksiyalar uchun ham chaqiriladi. Natijada jadval API'si Swiss
    //     turnirlarida HAR DOIM bo'sh float qaytarardi, holbuki
    //     `farzin_pairing_float_count` metrikasi nolga teng emas edi
    //     (docs/AUDIT.md JIDDIY-5). Sxema bu maydonni "juftlashtirish uchun
    //     kerak" deb ta'riflaydi — noto'g'ri ma'lumot jimgina tarqalardi.
    //
    // Round-robin uchun natija baribir bo'sh massiv bo'ladi (float faqat
    // turli ochkoli o'yinchilar uchraganda paydo bo'ladi), ya'ni eski
    // xulq saqlanadi — endi u FARAZ emas, HISOB natijasi.
    const floatByRegistration = new Map<string, string[]>(
      buildPairingStates(toSeeds(participants), history).map((state) => [
        String(state.playerId),
        [...state.floatHistory],
      ]),
    );

    const ratingById = new Map(participants.map((p) => [p.id, p.ratingAtEntry]));
    const inputs: PlayerTieBreakInput[] = views.map((view) => {
      const rating = ratingById.get(view.registrationId);
      return {
        playerId: view.registrationId,
        points: view.points,
        games: view.games,
        // exactOptionalPropertyTypes: reytingsizga maydon umuman berilmaydi.
        ...(rating !== null && rating !== undefined && { rating }),
      };
    });

    const order = this.resolveTieBreakOrder(section);
    const values = this.tieBreaks.compute(inputs, order);
    const ranking = this.tieBreaks.rank(inputs, order);
    const rankById = new Map(ranking.map((id, index) => [id, index + 1]));

    const rows: UpsertStandingInput[] = views.map((view) => ({
      registrationId: view.registrationId,
      points: view.points.toFixed(1),
      rank: rankById.get(view.registrationId) ?? views.length,
      tieBreakValues: toPlainRecord(values.get(view.registrationId) ?? {}),
      gamesPlayed: view.gamesPlayed,
      wins: view.wins,
      draws: view.draws,
      losses: view.losses,
      colorHistory: [...view.colorHistory],
      floatHistory: floatByRegistration.get(view.registrationId) ?? [],
    }));

    await this.repo.upsertStandings(section.id, rows);
  }

  /**
   * Seksiya tieBreakOrder validatsiyasi: noma'lum kalit e'tiborsiz
   * qoldiriladi (warn bilan), bo'sh ro'yxat → default tartib
   * (arbiter.types.ts DEFAULT_TIE_BREAK_ORDER).
   */
  private resolveTieBreakOrder(section: SectionContextRow): readonly TieBreakKey[] {
    const known: TieBreakKey[] = [];
    const unknown: string[] = [];
    for (const key of section.tieBreakOrder) {
      if ((TIE_BREAK_KEYS as readonly string[]).includes(key)) {
        known.push(key as TieBreakKey);
      } else {
        unknown.push(key);
      }
    }
    if (unknown.length > 0) {
      this.logger.warn(
        `Noma'lum tie-break kalitlari e'tiborsiz qoldirildi: ${unknown.join(', ')} (section=${section.id})`,
      );
    }
    return known.length > 0 ? known : DEFAULT_TIE_BREAK_ORDER;
  }

  // --- Yordamchilar -----------------------------------------------------------------

  private async requireSection(
    sectionId: string,
    resource: string,
    resourceId?: string,
  ): Promise<SectionContextRow> {
    const section = await this.repo.findSectionWithTournament(sectionId);
    if (section === null) {
      throw new NotFoundError(resource, resourceId ?? sectionId);
    }
    return section;
  }

  private async requirePublicSection(sectionId: string): Promise<SectionContextRow> {
    const section = await this.repo.findSectionWithTournament(sectionId);
    if (section === null || !section.tournament.isPublic || section.tournament.status === 'DRAFT') {
      // Yashirin turnir mavjudligi oshkor qilinmaydi — 404.
      throw new NotFoundError('TournamentSection', sectionId);
    }
    return section;
  }

  /**
   * Boshqaruv ruxsati: biriktirilgan hakam YOKI turnirni boshqara
   * oladigan rol (rbac.can 'update' Tournament — org ierarxiyasi bilan).
   * Rad → 404 (docs/04-api-spec.md §2.4).
   */
  private async assertManageAccess(
    actor: Actor,
    section: SectionContextRow,
    resource: string,
    resourceId?: string,
  ): Promise<void> {
    if (await this.repo.isArbiterOf(section.tournament.id, actor.userId)) {
      return;
    }
    const t = section.tournament;
    const allowed = this.rbac.can(actor, 'update', {
      type: 'Tournament',
      ...(t.clubId !== null && { clubId: t.clubId }),
      ...(t.regionId !== null && { regionId: t.regionId }),
      ...(t.federationId !== null && { federationId: t.federationId }),
      tournamentId: t.id,
    });
    if (!allowed) {
      throw new NotFoundError(resource, resourceId ?? section.id);
    }
  }

  /** Juftlashtirish/natija faqat IN_PROGRESS turnirda (Faza 1 qoida). */
  private assertTournamentInProgress(section: SectionContextRow): void {
    if (section.tournament.status !== 'IN_PROGRESS') {
      throw new BusinessRuleError(
        'TOURNAMENT_NOT_IN_PROGRESS',
        'Juftlashtirish va natija kiritish faqat IN_PROGRESS holatidagi turnirda',
        { status: section.tournament.status },
      );
    }
  }
}

// --- Sof yordamchilar (fayl ichida) ---------------------------------------------

function toSeeds(participants: readonly ParticipantRow[]): ParticipantSeed[] {
  return participants.map((p) => ({
    registrationId: p.id,
    // numberedRegistrations faqat raqamlilarni qaytaradi; 0 — tip himoyasi.
    pairingNumber: p.pairingNumber ?? 0,
    ratingAtEntry: p.ratingAtEntry,
    isWithdrawn: p.isWithdrawn,
    joinedAtRound: p.joinedAtRound,
  }));
}

/**
 * Partial<Record<K, number>> → toza Record (undefined qiymatlarsiz) —
 * exactOptionalPropertyTypes ostida JSON ustuniga xavfsiz yozish uchun.
 */
function toPlainRecord(partial: Readonly<Partial<Record<string, number>>>): Record<string, number> {
  const out: Record<string, number> = {};
  for (const [key, value] of Object.entries(partial)) {
    if (value !== undefined) {
      out[key] = value;
    }
  }
  return out;
}
