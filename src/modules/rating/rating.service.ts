import { Injectable, Logger } from '@nestjs/common';
import { Interval } from '@nestjs/schedule';

import { BusinessRuleError, ConflictError, NotFoundError } from '../../core/errors/domain.error';
import { Glicko2Service } from '../../core/rating/glicko2.service';
import { DEFAULT_GLICKO2_CONFIG, Glicko2ConvergenceError } from '../../core/rating/glicko2.types';
import { playEnvironmentLabel, timeCategoryLabel } from '../../shared/metrics/metrics.labels';
import { MetricsService } from '../../shared/metrics/metrics.service';
import {
  DEFAULT_PAGE_SIZE,
  decodeCursor,
  MAX_PAGE_SIZE,
  type Page,
  toPage,
} from '../../shared/pagination/cursor';
import { type Actor, RbacService } from '../identity/rbac.port';
import {
  computePeriodResults,
  DEFAULT_PRE_PERIOD_STATE,
  isEstablished,
  type PrePeriodState,
  type RatedGame,
} from './period-computation';
import type { CurrentRating, RatingPort } from './rating.port';
import { RatingRepository } from './rating.repository';
import {
  isValidRatingCombo,
  type LeaderboardRow,
  PLAY_ENVIRONMENTS,
  type PlayEnvironment,
  type RatingHistoryRow,
  type RatingPeriodRow,
  TAU_DEFAULT,
  TAU_MAX,
  TAU_MIN,
  TIME_CATEGORIES,
  type TimeCategory,
} from './rating.types';

export interface CreatePeriodServiceInput {
  environment: PlayEnvironment;
  timeCategory: TimeCategory;
  startsAt: Date;
  endsAt: Date;
  tau?: number | undefined;
}

/**
 * Rating — milliy Glicko-2 reyting yadrosi (docs/14-roadmap.md Faza 3,
 * docs/06-rating-system.md).
 *
 * Asosiy qarorlar:
 *  - BATCH SEMANTIKA (docs/06 §3): davrdagi barcha o'yin davr BOSHIDAGI
 *    snapshot bilan hisoblanadi — raqib reytingi ham. O'yinlar tartibi
 *    natijaga ta'sir qilmaydi.
 *  - IDEMPOTENT recompute (docs/06 §9.3): sof hisob (period-computation.ts)
 *    + absolyut qiymatli upsert (rating.repository.ts) + davrda muzlatilgan
 *    τ. Qayta ishga tushirish bir xil kirishda bir xil holat beradi;
 *    recomputeGeneration faqat qayta hisobda +1.
 *  - Davr-boshi holati recompute'da mavjud RatingHistory yozuvining
 *    `*Before` qiymatlaridan TIKLANADI (joriy PlayerRating allaqachon
 *    "keyin"gi holat). Provisional bayrog'i ham shu qiymatlardan qayta
 *    chiqariladi — hujjatlangan soddalashtirish: davrdan OLDIN established
 *    bo'lib, RD'si keyin 110 dan oshgan o'yinchi chekka holati Faza 3
 *    zanjirli recompute bilan birga hal qilinadi (docs/06 §9).
 *  - Ruxsat yo'q → 404 (docs/04-api-spec.md §2.4).
 */
@Injectable()
export class RatingService implements RatingPort {
  private readonly logger = new Logger(RatingService.name);

  constructor(
    private readonly repo: RatingRepository,
    private readonly rbac: RbacService,
    private readonly metrics: MetricsService,
  ) {}

  // --- Kuzatuvchanlik (docs/15-observability.md §3.3 REYTING) ------------------

  /**
   * `farzin_rating_period_lag_seconds` — "davr yopilishi kerak edi, lekin
   * yopilmagan" vaqti.
   *
   * NEGA REJALI VAZIFA, HODISA EMAS: kechikish hodisasi YO'Q. Aynan
   * "hech narsa sodir bo'lmayapti" holatini o'lchash kerak (docs/15 §3.3
   * izohi: reyting jimgina eskiradi). Shuning uchun gauge davriy so'rov
   * bilan yangilanadi.
   *
   * HAR TSIKLDA BARCHA kombinatsiya yoziladi (kechikishi yo'qlariga 0):
   * aks holda kechikish tuzatilgach gauge oxirgi "yomon" qiymatda muzlab
   * qoladi va alert abadiy yonadi.
   */
  @Interval(60_000)
  async refreshPeriodLagMetric(): Promise<void> {
    try {
      const now = new Date();
      const pending = await this.repo.oldestUncomputedPeriodEnds(now);
      const lagByCombo = new Map<string, number>(
        pending.map((p) => [
          `${p.environment}:${p.timeCategory}`,
          Math.max(0, (now.getTime() - p.endsAt.getTime()) / 1000),
        ]),
      );

      for (const environment of PLAY_ENVIRONMENTS) {
        for (const timeCategory of TIME_CATEGORIES) {
          if (!isValidRatingCombo(environment, timeCategory)) {
            continue; // OTB_BULLET mavjud emas (docs/06 §5.1)
          }
          this.metrics.setRatingPeriodLag(lagByCombo.get(`${environment}:${timeCategory}`) ?? 0, {
            environment: playEnvironmentLabel(environment),
            timeCategory: timeCategoryLabel(timeCategory),
          });
        }
      }
    } catch (err) {
      // Metrika yangilanmagani biznes oqimini to'xtatmaydi — u kuzatadi,
      // boshqarmaydi. Lekin jimgina o'tmaydi ham.
      this.logger.warn(`Rating period lag metrikasi yangilanmadi: ${String(err)}`);
    }
  }

  // --- RatingPeriod boshqaruvi -------------------------------------------------

  async createPeriod(actor: Actor, input: CreatePeriodServiceInput): Promise<RatingPeriodRow> {
    const allowed = this.rbac.can(actor, 'create', { type: 'RatingPeriod' });
    if (!allowed) {
      throw new NotFoundError('RatingPeriod');
    }

    this.assertValidCombo(input.environment, input.timeCategory);

    if (input.endsAt <= input.startsAt) {
      throw new BusinessRuleError(
        'INVALID_PERIOD_RANGE',
        "endsAt startsAt dan keyin bo'lishi shart",
        {
          startsAt: input.startsAt.toISOString(),
          endsAt: input.endsAt.toISOString(),
        },
      );
    }

    const tau = input.tau ?? TAU_DEFAULT;
    if (tau < TAU_MIN || tau > TAU_MAX) {
      // Glickman tavsiya oralig'i (docs/06 §2.13).
      throw new BusinessRuleError(
        'INVALID_TAU',
        `tau ${String(TAU_MIN)}..${String(TAU_MAX)} oralig'ida bo'lishi shart`,
        {
          tau,
        },
      );
    }

    const overlapping = await this.repo.findOverlappingPeriod(
      input.environment,
      input.timeCategory,
      input.startsAt,
      input.endsAt,
    );
    if (overlapping !== null) {
      // Bir kategoriya vaqt o'qida kesishgan ikki davr — bitta o'yin ikki
      // marta hisoblanadi. Taqiqlangan.
      throw new ConflictError('Bu kategoriyada kesishuvchi davr allaqachon bor', {
        existingPeriodId: overlapping.id,
        startsAt: overlapping.startsAt.toISOString(),
        endsAt: overlapping.endsAt.toISOString(),
      });
    }

    return await this.repo.createPeriod(
      {
        environment: input.environment,
        timeCategory: input.timeCategory,
        startsAt: input.startsAt,
        endsAt: input.endsAt,
        tau,
      },
      actor.userId,
    );
  }

  /**
   * Davrni hisoblash / QAYTA hisoblash — idempotent, istalgan marta xavfsiz.
   *
   * Oqim: o'yinlarni yig'ish → davr-boshi holatlarini qurish → sof Glicko-2
   * hisobi (davr τ'si bilan) → bitta tranzaksiyada qo'llash (advisory lock
   * ostida). Sabab MAJBURIY — auditga kiradi (docs/06 §9.5).
   */
  async computePeriod(actor: Actor, periodId: string, reason: string): Promise<RatingPeriodRow> {
    const allowed = this.rbac.can(actor, 'update', { type: 'RatingPeriod' });
    if (!allowed) {
      throw new NotFoundError('RatingPeriod', periodId);
    }

    const period = await this.repo.findPeriodById(periodId);
    if (period === null) {
      throw new NotFoundError('RatingPeriod', periodId);
    }

    const trimmedReason = reason.trim();
    if (trimmedReason === '') {
      throw new BusinessRuleError(
        'RECOMPUTE_REASON_REQUIRED',
        'Reyting hisoblash uchun sabab majburiy',
        { periodId },
      );
    }

    const games = await this.repo.gamesForPeriod(
      period.environment,
      period.timeCategory,
      period.startsAt,
      period.endsAt,
    );

    const states = await this.buildPrePeriodStates(period, games);

    // Davr τ'si bilan hisoblagich — konstanta o'zgarsa ham eski davr eski
    // τ bilan qayta hisoblanadi (docs/06 §8.1, §9.3 #2).
    const calculator = new Glicko2Service({
      ...DEFAULT_GLICKO2_CONFIG,
      tau: period.tau,
    });

    // ── Kuzatuvchanlik (docs/15 §3.3 REYTING) ────────────────────────────
    // Sof hisob core/ da; vaqt SHU YERDA o'lchanadi (core/ bog'liqliksiz
    // qoladi — ADR-0001). `periodId` metrikaga TUSHMAYDI (§3.4) — u
    // log'da va audit'da bor.
    const computeStartedAt = Date.now();
    let results;
    try {
      results = computePeriodResults(calculator, games, states);
    } catch (error) {
      if (error instanceof Glicko2ConvergenceError) {
        // Illinois algoritmi odatda < 20 qadamda yaqinlashadi. Yaqinlashmasa
        // — matematik muammo bor va REYTING ISHONCHSIZ (docs/15 §3.3).
        // Nol tolerantlik: bu counter > 0 → `page` alert.
        this.metrics.incGlickoConvergenceFailure();
      }
      throw error;
    }
    this.metrics.observeRatingRecomputeDuration((Date.now() - computeStartedAt) / 1000);

    // Clamp monitoringi (docs/06 §10.4): jimgina tuzatib ketilmaydi —
    // WARN log, alert nomzodi.
    for (const result of results) {
      for (const warning of result.clampWarnings) {
        this.logger.warn(`Glicko-2 clamp: ${warning} (period=${periodId})`);
      }
      // RD taqsimoti — reyting ishonchliligi sog'ligi (§3.3, §5.4
      // dashboard'i). Bu histogram, o'yinchi bo'yicha yorliq YO'Q.
      this.metrics.observeRatingDeviation(result.after.deviation);
    }

    return await this.repo.applyPeriodResults({
      periodId,
      environment: period.environment,
      timeCategory: period.timeCategory,
      actorUserId: actor.userId,
      reason: trimmedReason,
      gamesProcessed: games.length,
      results,
    });
  }

  /**
   * Davr-boshi holatlari: o'yin o'ynaganlar ∪ barcha reytingli o'yinchilar
   * (o'ynamaganlarga idle RD o'sishi — docs/06 §2.11, §3.4).
   *
   * Recompute'da (davr uchun history bor) davr-boshi qiymatlari history
   * `*Before` maydonlaridan tiklanadi — joriy PlayerRating bu davr
   * natijasini allaqachon o'z ichiga olgan bo'ladi.
   */
  private async buildPrePeriodStates(
    period: RatingPeriodRow,
    games: readonly RatedGame[],
  ): Promise<Map<string, PrePeriodState>> {
    const gamePlayerIds = [...new Set(games.flatMap((g) => [g.whitePlayerId, g.blackPlayerId]))];

    const [rated, withGames, priorHistory] = await Promise.all([
      this.repo.allRatedPlayers(period.environment, period.timeCategory),
      this.repo.playersWithRatings(gamePlayerIds, period.environment, period.timeCategory),
      this.repo.priorHistoryForPeriod(period.id),
    ]);

    const currentById = new Map([...rated, ...withGames].map((r) => [r.playerId, r]));
    const historyById = new Map(priorHistory.map((h) => [h.playerId, h]));

    const states = new Map<string, PrePeriodState>();
    const allIds = new Set([...currentById.keys(), ...gamePlayerIds]);

    for (const playerId of allIds) {
      const current = currentById.get(playerId);
      const prior = historyById.get(playerId);

      if (prior !== undefined && current !== undefined) {
        // RECOMPUTE: davr-boshi holati history'dan.
        const gamesPlayedBefore = Math.max(0, current.gamesPlayed - prior.gamesInPeriod);
        states.set(playerId, {
          rating: prior.ratingBefore,
          deviation: prior.deviationBefore,
          volatility: prior.volatilityBefore,
          gamesPlayed: gamesPlayedBefore,
          isProvisional: !isEstablished(gamesPlayedBefore, prior.deviationBefore),
          peakRating: current.peakRating,
        });
      } else if (current !== undefined) {
        // Birinchi hisob: joriy PlayerRating = davr-boshi holati.
        states.set(playerId, {
          rating: current.rating,
          deviation: current.deviation,
          volatility: current.volatility,
          gamesPlayed: current.gamesPlayed,
          isProvisional: current.isProvisional,
          peakRating: current.peakRating,
        });
      } else {
        // Yangi o'yinchi — create-on-demand semantikasi (docs/06 §4.1):
        // qator hisob natijasi bilan birga yaratiladi.
        states.set(playerId, DEFAULT_PRE_PERIOD_STATE);
      }
    }

    return states;
  }

  // --- RATING_PORT ---------------------------------------------------------------

  async getCurrentRating(
    playerId: string,
    environment: PlayEnvironment,
    timeCategory: TimeCategory,
  ): Promise<CurrentRating | null> {
    const row = await this.repo.findPlayerRating(playerId, environment, timeCategory);
    if (row === null) {
      return null;
    }
    return { rating: row.rating, isProvisional: row.isProvisional };
  }

  // --- Ommaviy o'qishlar ------------------------------------------------------------

  async leaderboard(query: {
    environment: PlayEnvironment;
    timeCategory: TimeCategory;
    first?: number | undefined;
    after?: string | undefined;
  }): Promise<Page<LeaderboardRow>> {
    this.assertValidCombo(query.environment, query.timeCategory);
    const pageSize = Math.min(Math.max(query.first ?? DEFAULT_PAGE_SIZE, 1), MAX_PAGE_SIZE);
    const afterId = query.after !== undefined ? decodeCursor(query.after) : null;
    const rows = await this.repo.leaderboard(
      query.environment,
      query.timeCategory,
      pageSize,
      afterId,
    );
    return toPage(rows, pageSize);
  }

  async playerHistory(
    playerId: string,
    query: {
      environment?: PlayEnvironment | undefined;
      timeCategory?: TimeCategory | undefined;
      first?: number | undefined;
      after?: string | undefined;
    },
  ): Promise<Page<RatingHistoryRow>> {
    const pageSize = Math.min(Math.max(query.first ?? DEFAULT_PAGE_SIZE, 1), MAX_PAGE_SIZE);
    const afterId = query.after !== undefined ? decodeCursor(query.after) : null;
    const rows = await this.repo.historyForPlayer(
      playerId,
      { environment: query.environment, timeCategory: query.timeCategory },
      pageSize,
      afterId,
    );
    return toPage(rows, pageSize);
  }

  async listPeriods(query: {
    environment?: PlayEnvironment | undefined;
    timeCategory?: TimeCategory | undefined;
    first?: number | undefined;
    after?: string | undefined;
  }): Promise<Page<RatingPeriodRow>> {
    const pageSize = Math.min(Math.max(query.first ?? DEFAULT_PAGE_SIZE, 1), MAX_PAGE_SIZE);
    const afterId = query.after !== undefined ? decodeCursor(query.after) : null;
    const rows = await this.repo.listPeriods(pageSize, afterId, {
      environment: query.environment,
      timeCategory: query.timeCategory,
    });
    return toPage(rows, pageSize);
  }

  // --- Yordamchilar -----------------------------------------------------------------

  private assertValidCombo(environment: PlayEnvironment, timeCategory: TimeCategory): void {
    if (!isValidRatingCombo(environment, timeCategory)) {
      // OTB_BULLET mavjud emas (docs/06 §5.1).
      throw new BusinessRuleError(
        'INVALID_RATING_CATEGORY',
        'OTB + BULLET kombinatsiyasi reyting kategoriyasi emas',
        { environment, timeCategory },
      );
    }
  }
}
