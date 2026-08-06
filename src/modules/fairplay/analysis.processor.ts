import { Inject, Injectable, Logger, type OnModuleDestroy } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Worker } from 'bullmq';

import type { AppConfig } from '../../config/configuration';
import { STARTING_FEN } from '../../core/chess/rules';
import {
  aggregateSuspicion,
  type SuspicionSignal,
} from '../../core/fairplay/suspicion-aggregation';
import {
  analyzeTiming,
  OPENING_PLIES_EXCLUDED,
  type TimingAnalysis,
} from '../../core/fairplay/timing-analysis';
import { FAIRPLAY_ANALYZE_JOB, QUEUE_NAMES, type FairplayAnalyzeJobData } from '../../shared/queue/queue.module';
import { TERMINAL_STATUSES, type TimeCategoryValue } from '../play/play.types';
import {
  engineCorrelation,
  MATE_CP,
  type EngineCorrelationResult,
  type EngineMoveObservation,
} from './engine/engine-correlation';
import { ANALYSIS_ENGINE, type AnalysisEngine, type PositionAnalysis } from './engine/uci-engine.port';
import { FairplayRepository, type GameForAnalysis, type NewSignalInput } from './fairplay.repository';

/**
 * fairplay.analyzeGame job protsessori (docs/08 §8.1).
 *
 * ═══════════════════════════════════════════════════════════════════════════
 *  BU YO'L HECH QACHON JAZOLAMAYDI (docs/08 §4.1, CANON §7.5).
 *
 *  Protsessor faqat O'LCHAYDI va YOZADI: FairPlayReport (upsert) va —
 *  chegara oshsa — FairPlayCase(OPEN) + FairPlaySignal. Ish OCHILISHI
 *  o'yinchiga hech qanday ta'sir qilmaydi: ban yo'q, blok yo'q, xabar
 *  ham yo'q (§4.2 3-band: asossiz shubha yetkazilmaydi). Sanksiya
 *  faqat komissiya /decide qarori bilan (repository.decideCase — odam
 *  aktori + yozma asos MAJBURIY).
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * Ishga tushirish: FAQAT worker processi (src/worker.ts → start()).
 * API processi bu navbatni QAYTA ISHLAMAYDI — Stockfish CPU'ni to'liq
 * yeydi va HTTP javob vaqtini buzadi (docs/02 §7 izolyatsiya).
 *
 * Idempotentlik (ADR-0008 at-least-once): report — upsert; signal —
 * (type, gameId) dedupe repository'da; qayta bajarilish natijani buzmaydi.
 */
@Injectable()
export class AnalysisProcessor implements OnModuleDestroy {
  private readonly logger = new Logger(AnalysisProcessor.name);
  private worker: Worker<FairplayAnalyzeJobData> | null = null;

  constructor(
    private readonly repo: FairplayRepository,
    private readonly config: ConfigService<AppConfig, true>,
    @Inject(ANALYSIS_ENGINE) private readonly engine: AnalysisEngine | null,
  ) {}

  /**
   * BullMQ Worker'ni ochish — src/worker.ts chaqiradi. API processida
   * chaqirilmaydi (CPU izolyatsiyasi). Idempotent.
   */
  start(): void {
    if (this.worker !== null) {
      return;
    }
    const redis = this.config.get('redis', { infer: true });
    this.worker = new Worker<FairplayAnalyzeJobData>(
      QUEUE_NAMES.fairplay,
      async (job) => {
        if (job.name !== FAIRPLAY_ANALYZE_JOB) {
          return; // noma'lum job — kelajak uchun himoya
        }
        await this.process(job.data);
      },
      {
        connection: {
          host: redis.host,
          port: redis.port,
          ...(redis.password !== undefined && { password: redis.password }),
          db: redis.db,
          // BullMQ blocking buyruqlari uchun majburiy sozlama.
          maxRetriesPerRequest: null,
        },
        // Engine bitta process — parallellik worker SONI bilan (docs/02 §7).
        concurrency: 1,
      },
    );
    this.worker.on('failed', (job, err) => {
      this.logger.warn(`fairplay job yiqildi: ${job?.id ?? '?'} — ${err.message}`);
    });
    this.logger.log(`fairplay worker ishga tushdi (engine: ${this.engine?.name ?? "YO'Q — faqat vaqt tahlili"})`);
  }

  async onModuleDestroy(): Promise<void> {
    await this.worker?.close();
    this.worker = null;
    await this.engine?.dispose();
  }

  /**
   * Job yadrosi — testda TO'G'RIDAN-TO'G'RI chaqiriladi (integration
   * spec worker/Redis navbatisiz; hujjatlangan tanlov — ishonchli yo'l).
   */
  async process(data: FairplayAnalyzeJobData): Promise<void> {
    const game = await this.repo.findGameForAnalysis(data.gameId);
    if (game === null || game.moves.length === 0) {
      return;
    }
    if (!TERMINAL_STATUSES.includes(game.status) || game.status === 'ABORTED') {
      return; // tugamagan yoki bekor qilingan o'yin — tahlil ma'nosiz
    }

    const targets =
      data.playerId !== undefined
        ? [game.whitePlayerId, game.blackPlayerId].filter((p) => p === data.playerId)
        : [game.whitePlayerId, game.blackPlayerId];
    if (targets.length === 0) {
      return; // playerId o'yin ishtirokchisi emas — job noto'g'ri, jimgina tashlanadi
    }

    // Engine baholari — BIR MARTA butun o'yin uchun (ikkala o'yinchiga
    // xizmat qiladi). Engine yo'q/yiqilsa — korrelyatsiya o'chadi, vaqt
    // tahlili YO'QOLMAYDI.
    const engineStarted = Date.now();
    const evals = this.engine === null ? null : await this.evaluateAllPositions(game);
    const analysisMs = evals === null ? null : Date.now() - engineStarted;
    const depth = this.config.get('fairplay', { infer: true }).engineDepth;
    const threshold = this.config.get('fairplay', { infer: true }).suspicionThreshold;

    for (const playerId of targets) {
      await this.analyzePlayer(game, playerId, evals, depth, threshold, analysisMs);
    }
  }

  // --- Ichki -------------------------------------------------------------------

  private async analyzePlayer(
    game: GameForAnalysis,
    playerId: string,
    evals: readonly (PositionAnalysis | null)[] | null,
    depth: number,
    threshold: number,
    analysisMs: number | null,
  ): Promise<void> {
    const isWhite = playerId === game.whitePlayerId;
    const playerMoves = game.moves.filter((m) => (m.ply % 2 === 1) === isWhite);

    const timing = analyzeTiming(
      playerMoves.map((m) => ({ ply: m.ply, thinkTimeMs: m.thinkTimeMs })),
    );
    // docs/08 §2.2: bullet/blitz'da hamma tez o'ynaydi — vaqt signali
    // FAQAT klassik/rapid uchun ishonchli. O'lchov hisobotda qoladi,
    // signal esa yozilmaydi (FP himoyasi).
    const timingSignalEligible = isTimingEligible(game.timeCategory);

    const correlation = evals === null ? null : this.correlate(game, isWhite, evals);

    const suspicionInputs: SuspicionSignal[] = [];
    const caseSignals: NewSignalInput[] = [];

    if (timing !== null && timingSignalEligible) {
      suspicionInputs.push({ kind: 'TIMING_ANOMALY', strength: timing.strength });
      caseSignals.push({
        type: 'TIMING_ANOMALY',
        strength: round4(timing.strength),
        evidence: timingEvidence(game.id, timing),
      });
    }
    if (correlation !== null) {
      suspicionInputs.push({ kind: 'ENGINE_CORRELATION', strength: correlation.strength });
      caseSignals.push({
        type: 'ENGINE_CORRELATION',
        strength: round4(correlation.strength),
        evidence: correlationEvidence(game.id, correlation, this.engine?.name ?? null, depth),
      });
    }

    const suspicion = aggregateSuspicion(suspicionInputs);

    await this.repo.upsertReport({
      gameId: game.id,
      playerId,
      topMoveMatchRate: correlation === null ? null : round4(correlation.topOneMatchRate),
      avgCentipawnLoss: correlation === null ? null : round2(correlation.avgCentipawnLoss),
      // Sekund² — schema Decimal(10,4) sig'imi uchun (ms² sig'maydi).
      timingVariance: timing === null ? null : round4(Math.min(timing.varianceMs2 / 1_000_000, 999_999)),
      suspicionScore: suspicion === null ? null : round4(suspicion),
      engineName: correlation === null ? null : (this.engine?.name ?? null),
      engineDepth: correlation === null ? null : depth,
      analysisMs,
    });

    if (suspicion !== null && suspicion >= threshold) {
      // Chegara oshdi → ish komissiyaga KO'RINADI. JAZO YO'Q, BLOK YO'Q —
      // faqat "bu o'yinga odam qarasin" (docs/08 §4.2 1-band).
      const { caseId, created } = await this.repo.recordSignals({
        playerId,
        gameId: game.id,
        signals: caseSignals,
        actorUserId: null, // tizim harakati — audit 'fairplay.flagged'
        auditAction: 'fairplay.flagged',
      });
      this.logger.log(
        `fairplay.flagged: case=${caseId} (yangi=${String(created)}) game=${game.id} score=${suspicion.toFixed(4)}`,
      );
    }
  }

  /**
   * Har pozitsiya bahosi: fens[0] = boshlang'ich, fens[i] = moves[i-1]
   * dan keyin. Yakuniy pozitsiya ham baholanadi (oxirgi yurish CPL'i
   * uchun). Bitta pozitsiya yiqilsa (masalan, mat pozitsiyasida
   * "bestmove (none)") — o'sha o'ringa null, qolganlari davom etadi.
   */
  private async evaluateAllPositions(
    game: GameForAnalysis,
  ): Promise<(PositionAnalysis | null)[] | null> {
    if (this.engine === null) {
      return null;
    }
    const depth = this.config.get('fairplay', { infer: true }).engineDepth;
    const fens: string[] = [STARTING_FEN, ...game.moves.map((m) => m.fenAfter)];
    const evals: (PositionAnalysis | null)[] = [];
    for (const fen of fens) {
      try {
        evals.push(await this.engine.analyzePosition(fen, depth));
      } catch (e) {
        evals.push(null);
        this.logger.warn(
          `engine pozitsiyani baholay olmadi (game=${game.id}): ${e instanceof Error ? e.message : String(e)}`,
        );
      }
    }
    return evals;
  }

  private correlate(
    game: GameForAnalysis,
    isWhite: boolean,
    evals: readonly (PositionAnalysis | null)[],
  ): EngineCorrelationResult | null {
    const observations: EngineMoveObservation[] = [];
    for (const move of game.moves) {
      if ((move.ply % 2 === 1) !== isWhite) {
        continue;
      }
      if (move.ply <= OPENING_PLIES_EXCLUDED) {
        continue; // debyut — nazariya chit emas (docs/08 §2.1)
      }
      const before = evals[move.ply - 1]; // pozitsiya yurishdan OLDIN (o'yinchi navbati)
      const after = evals[move.ply]; // yurishdan KEYIN (raqib navbati)
      if (before == null || after == null || before.bestMoveUci === '') {
        continue;
      }
      observations.push({
        playedUci: move.uci,
        bestMoveUci: before.bestMoveUci,
        evalBeforeCp: toCp(before),
        // Keyingi pozitsiya bahosi RAQIB nuqtai nazarida — teskarisi olinadi.
        evalAfterCp: -toCp(after),
      });
    }
    return engineCorrelation(observations);
  }
}

// --- Sof yordamchilar -----------------------------------------------------------

function isTimingEligible(category: TimeCategoryValue): boolean {
  return category === 'CLASSICAL' || category === 'RAPID';
}

/** Mat bahosi cp shkalasiga: matni beruvchi tomon uchun +MATE_CP. */
function toCp(p: PositionAnalysis): number {
  if (p.evalCp !== null) {
    return p.evalCp;
  }
  if (p.mate !== null) {
    return p.mate > 0 ? MATE_CP : -MATE_CP;
  }
  return 0;
}

function round4(x: number): number {
  return Math.round(x * 10_000) / 10_000;
}

function round2(x: number): number {
  return Math.round(x * 100) / 100;
}

/** Evidence — komissiya ko'radigan xom raqamlar (docs/08 §6.2: dalilni ko'rish huquqi). */
function timingEvidence(gameId: string, t: TimingAnalysis): Record<string, number | string> {
  return {
    gameId,
    sampleSize: t.sampleSize,
    excludedCount: t.excludedCount,
    meanMs: Math.round(t.meanMs),
    stdDevMs: Math.round(t.stdDevMs),
    coefficientOfVariation: round4(t.coefficientOfVariation),
    strength: round4(t.strength),
    // Halol talqin — komissiya uchun (docs/08 §2.2 FP ogohlantirishlari).
    interpretation:
      "Past variatsiya = bir tekis vaqtlar = shubhali NAQSH. Bu isbot EMAS: ba'zi o'yinchilar tabiatan tez va tekis o'ynaydi.",
  };
}

function correlationEvidence(
  gameId: string,
  c: EngineCorrelationResult,
  engineName: string | null,
  depth: number,
): Record<string, number | string | null> {
  return {
    gameId,
    sampleSize: c.sampleSize,
    excludedCount: c.excludedCount,
    topOneMatchRate: round4(c.topOneMatchRate),
    avgCentipawnLoss: round2(c.avgCentipawnLoss),
    cplStdDev: round2(c.cplStdDev),
    strength: round4(c.strength),
    // Qayta ishlab chiqarish uchun (docs/08 §5: analysisMeta'siz raqam dalil emas).
    engineName,
    engineDepth: depth,
    interpretation:
      "Yuqori mos kelish kuchli o'yinchida ham normal (GM 60–70% T1). Bu isbot EMAS — faqat ko'rib chiqish ustuvorligi.",
  };
}
