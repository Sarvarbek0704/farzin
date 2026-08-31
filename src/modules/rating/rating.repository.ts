import { Injectable } from '@nestjs/common';
import type { PlayerRating, Prisma, RatingHistory, RatingPeriod } from '@prisma/client';

import { ConflictError } from '../../core/errors/domain.error';
import { AuditService } from '../../shared/audit/audit.service';
import { OutboxService } from '../../shared/outbox/outbox.service';
import { PrismaService } from '../../shared/prisma/prisma.service';
import { onlineRatedResult, RATED_ONLINE_STATUSES } from './online-result-mapping';
import type { PlayerPeriodResult } from './period-computation';
import type {
  LeaderboardRow,
  PlayEnvironment,
  PlayerRatingRow,
  RatingHistoryRow,
  RatingPeriodRow,
  TimeCategory,
} from './rating.types';

/**
 * Rating ma'lumot qatlami — Prisma FAQAT shu faylda
 * (.dependency-cruiser.js `prisma-only-in-infrastructure`).
 *
 * Yozuv amallari audit bilan BIR TRANZAKSIYADA (docs/10-security.md §10);
 * davr hisobi qo'shimcha ravishda outbox `RatingRecomputed` bilan ham
 * atomik (ADR-0008).
 *
 * MODUL CHEGARASI: Pairing/Round/TournamentSection va OnlineGame
 * o'qishlari — reyting manbai uchun kulrang zona (arbiter.repository.ts
 * dagi kabi, Faza 1 pretsedenti): boshqa modul jadvalini o'qish FAQAT shu
 * repository ichida, service/port qatlamiga chiqmaydi. Yozuv FAQAT rating
 * jadvallariga.
 *
 * Decimal → number: har o'qishda `.toNumber()` — aniq, hujjatlangan
 * konversiya (docs/06 §8.2: saqlash NUMERIC, hisob IEEE 754 double).
 */

/**
 * Advisory lock sinfi — rating hisobi uchun ajratilgan kalit maydoni.
 * Outbox publisher kaliti (0x0fa1_2b0c) bilan to'qnashmaydi.
 */
const RATING_LOCK_CLASS = 0x0fa1_3d00;

/**
 * periodId → barqaror 31-bitli musbat kalit (FNV-1a). Bir davr uchun bir
 * xil kalit → parallel compute'lar bitta lock uchun raqobatlashadi;
 * boshqa davrlar bir-birini bloklamaydi.
 */
export function periodLockKey(periodId: string): number {
  let hash = 0x811c_9dc5;
  for (let i = 0; i < periodId.length; i += 1) {
    hash ^= periodId.charCodeAt(i);
    hash = Math.imul(hash, 0x0100_0193);
  }
  // 31 bitga toraytirish (musbat int4 oralig'i) + sinf ofseti mod 2^31.
  return (RATING_LOCK_CLASS + (hash >>> 1)) % 0x7fff_ffff;
}

// --- Kirish tiplari -----------------------------------------------------------

export interface CreatePeriodInput {
  environment: PlayEnvironment;
  timeCategory: TimeCategory;
  startsAt: Date;
  endsAt: Date;
  tau: number;
}

export interface ListPeriodsFilter {
  environment?: PlayEnvironment | undefined;
  timeCategory?: TimeCategory | undefined;
}

/** Reytingga kiradigan partiya qatori (period-computation.RatedGame bilan mos). */
export interface RatedGameRow {
  pairingId: string;
  whitePlayerId: string;
  blackPlayerId: string;
  result: 'WHITE_WIN' | 'BLACK_WIN' | 'DRAW';
}

/** Recompute uchun: mavjud history yozuvining davr-boshi qiymatlari. */
export interface PriorHistoryRow {
  playerId: string;
  ratingBefore: number;
  deviationBefore: number;
  volatilityBefore: number;
  gamesInPeriod: number;
}

export interface ApplyPeriodResultsInput {
  periodId: string;
  environment: PlayEnvironment;
  timeCategory: TimeCategory;
  actorUserId: string;
  /** Audit uchun MAJBURIY — 'rating.recalculated' REASON_REQUIRED ro'yxatida. */
  reason: string;
  gamesProcessed: number;
  results: readonly PlayerPeriodResult[];
}

export interface HistoryFilter {
  environment?: PlayEnvironment | undefined;
  timeCategory?: TimeCategory | undefined;
}

@Injectable()
export class RatingRepository {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly outbox: OutboxService,
  ) {}

  // --- RatingPeriod -----------------------------------------------------------

  async createPeriod(input: CreatePeriodInput, actorUserId: string): Promise<RatingPeriodRow> {
    return await this.prisma.$transaction(async (tx) => {
      const created = await tx.ratingPeriod.create({
        data: {
          environment: input.environment,
          timeCategory: input.timeCategory,
          startsAt: input.startsAt,
          endsAt: input.endsAt,
          tau: input.tau,
        },
      });
      await this.audit.write(tx, {
        action: 'rating.period_created',
        actorUserId,
        resourceType: 'RatingPeriod',
        resourceId: created.id,
        after: {
          environment: created.environment,
          timeCategory: created.timeCategory,
          startsAt: created.startsAt.toISOString(),
          endsAt: created.endsAt.toISOString(),
          tau: created.tau.toNumber(),
        },
      });
      return toPeriodRow(created);
    });
  }

  async findPeriodById(id: string): Promise<RatingPeriodRow | null> {
    const row = await this.prisma.ratingPeriod.findUnique({ where: { id } });
    return row === null ? null : toPeriodRow(row);
  }

  /** Bir (env, cat) da vaqt oralig'i KESISHGAN davr — 409 manbai (service). */
  async findOverlappingPeriod(
    environment: PlayEnvironment,
    timeCategory: TimeCategory,
    startsAt: Date,
    endsAt: Date,
  ): Promise<RatingPeriodRow | null> {
    const row = await this.prisma.ratingPeriod.findFirst({
      where: {
        environment,
        timeCategory,
        startsAt: { lt: endsAt },
        endsAt: { gt: startsAt },
      },
    });
    return row === null ? null : toPeriodRow(row);
  }

  /**
   * Muddati o'tgan, lekin HALI HISOBLANMAGAN davrlar — har (muhit, vaqt
   * kategoriyasi) kesimida ENG ESKISI.
   *
   * `farzin_rating_period_lag_seconds` manbai (docs/15-observability.md
   * §3.3). Bu metrika kerak, chunki kechikish JIMGINA bo'ladi: job
   * ishlamasa hech qanday xato yo'q, faqat reyting eskiradi va o'yinchi
   * noto'g'ri seed oladi.
   *
   * Arzon so'rov: `@@index([computedAt])` + kichik jadval (kategoriya
   * bo'yicha oyiga bir necha qator).
   */
  async oldestUncomputedPeriodEnds(
    now: Date,
  ): Promise<{ environment: PlayEnvironment; timeCategory: TimeCategory; endsAt: Date }[]> {
    const groups = await this.prisma.ratingPeriod.groupBy({
      by: ['environment', 'timeCategory'],
      where: { computedAt: null, endsAt: { lte: now } },
      _min: { endsAt: true },
    });
    return groups.flatMap((g) =>
      g._min.endsAt === null
        ? []
        : [{ environment: g.environment, timeCategory: g.timeCategory, endsAt: g._min.endsAt }],
    );
  }

  async listPeriods(
    first: number,
    afterId: string | null,
    filter: ListPeriodsFilter,
  ): Promise<RatingPeriodRow[]> {
    const rows = await this.prisma.ratingPeriod.findMany({
      where: {
        ...(filter.environment !== undefined && { environment: filter.environment }),
        ...(filter.timeCategory !== undefined && { timeCategory: filter.timeCategory }),
        ...(afterId !== null && { id: { gt: afterId } }),
      },
      orderBy: { id: 'asc' },
      take: first + 1,
    });
    return rows.map(toPeriodRow);
  }

  // --- O'yin manbai -------------------------------------------------------------

  /**
   * Davrga kiradigan partiyalar — manba MUHITGA bog'liq:
   *
   *  - OTB    → turnir juftliklari (Pairing) — quyidagi otbGamesForPeriod;
   *  - ONLINE → OnlineGame qatorlari — onlineGamesForPeriod.
   *
   * NEGA IKKI MANBA: OTB partiya faqat turnirda o'ynaladi va uning yagona
   * rasmiy izi — hakam tasdiqlagan Pairing natijasi. Onlayn partiya esa
   * OnlineGame'ning o'zi (matchmaking o'yinlari hech qanday pairing'ga
   * bog'lanmaydi; onlayn TURNIR o'yini ham OnlineGame sifatida o'ynaladi —
   * ikki marta sanamaslik uchun pairing yo'li FAQAT OTB'da qoladi).
   *
   * Ikkalasi ham docs/06 §3 BATCH-DAVR semantikasiga quyiladi: hech qanday
   * o'yin "darhol" reyting o'zgartirmaydi — davr yopilganda hammasi davr
   * BOSHIDAGI snapshot bilan bir yo'la hisoblanadi. Shu sababli bu metod
   * faqat davr oynasiga tushgan qatorlarni yig'ib, sof hisoblagichga
   * (period-computation.ts — o'zgarmagan) RatedGameRow shaklida beradi.
   *
   * MODUL CHEGARASI: OnlineGame o'qish — play modulining jadvali, lekin
   * arbiter/tournament o'qishlari kabi KULRANG ZONA pretsedenti bo'yicha
   * reyting o'z repository'sida o'qiydi (fayl sarlavhasidagi izoh):
   * Prisma faqat *.repository.ts da, yozuv faqat rating jadvallariga.
   */
  async gamesForPeriod(
    environment: PlayEnvironment,
    timeCategory: TimeCategory,
    startsAt: Date,
    endsAt: Date,
  ): Promise<RatedGameRow[]> {
    if (environment === 'ONLINE') {
      return await this.onlineGamesForPeriod(timeCategory, startsAt, endsAt);
    }
    return await this.otbGamesForPeriod(environment, timeCategory, startsAt, endsAt);
  }

  /**
   * OTB manbai (docs/06 §3, §11.4):
   *
   *  - faqat hal qiluvchi TAXTADA o'ynalgan natijalar (WHITE_WIN/BLACK_WIN/
   *    DRAW — result-mapping.ts da playedOverBoard=true uchlik). Forfeit,
   *    bye, UNPLAYED — reytingga KIRMAYDI (hard rule);
   *  - tur COMPLETED va `round.completedAt ∈ [startsAt, endsAt)` — vaqt
   *    manbai sifatida ATAYLAB hakam tasdiqlagan payt tanlangan
   *    (resultEnteredAt emas: natija tur yopilgunga qadar tahrirlanadi,
   *    completedAt esa yakuniy, arbiter.repository.completeRound);
   *  - seksiya (environment, timeCategory) mos;
   *  - turnir milliy reytingga hisoblanadi (isNationallyRated), soft-delete
   *    emas va CANCELLED emas (bekor qilingan turnir reytingga kirmaydi).
   *
   * ORDER BY id — determinizm uchun barqaror tartib (docs/06 §9.3 #4).
   */
  private async otbGamesForPeriod(
    environment: PlayEnvironment,
    timeCategory: TimeCategory,
    startsAt: Date,
    endsAt: Date,
  ): Promise<RatedGameRow[]> {
    const rows = await this.prisma.pairing.findMany({
      where: {
        result: { in: ['WHITE_WIN', 'BLACK_WIN', 'DRAW'] },
        blackRegistrationId: { not: null },
        round: {
          status: 'COMPLETED',
          completedAt: { gte: startsAt, lt: endsAt },
          section: {
            environment,
            timeCategory,
            tournament: {
              isNationallyRated: true,
              deletedAt: null,
              status: { not: 'CANCELLED' },
            },
          },
        },
      },
      select: {
        id: true,
        result: true,
        whiteRegistration: { select: { playerId: true } },
        blackRegistration: { select: { playerId: true } },
      },
      orderBy: { id: 'asc' },
    });

    return rows.flatMap((row) => {
      // where sharti null'ni chiqargan; tip himoyasi uchun tekshiruv qoladi.
      if (row.blackRegistration === null) {
        return [];
      }
      return [
        {
          pairingId: row.id,
          whitePlayerId: row.whiteRegistration.playerId,
          blackPlayerId: row.blackRegistration.playerId,
          result: row.result as 'WHITE_WIN' | 'BLACK_WIN' | 'DRAW',
        },
      ];
    });
  }

  /**
   * ONLINE manbai — OnlineGame (docs/06 §5 ONLINE_* kategoriyalari):
   *
   *  - isRated=true (do'stona chaqiriq false — reytingga kirmaydi);
   *  - endedAt ∈ [startsAt, endsAt) — onlayn o'yinning yakun payti server
   *    tomonda yoziladi (OTB'dagi hakam tasdig'iga ekvivalent yakuniy nuqta);
   *  - timeCategory mos (docs/06 §5.1 — ONLINE_BULLET BOR, OTB_BULLET yo'q);
   *  - status → natija mapping'i online-result-mapping.ts jadvalida:
   *    hal qiluvchi to'rtlik winnerColor bo'yicha 1/0, durang oltiligi
   *    0.5/0.5, ABORTED/PENDING/ACTIVE va g'olibsiz ABANDONED — chiqarib
   *    tashlanadi (onlineRatedResult null).
   *
   * O'yinchilar to'g'ridan-to'g'ri playerId (OnlineGame ustunlari) —
   * OTB'dagi registration bilvositaligi yo'q. `pairingId` maydonida
   * OnlineGame.id yotadi: sof hisoblagich (period-computation) uchun bu
   * shunchaki deterministik sort-kalit va RatingHistory.inputGames'dagi
   * o'yin havolasi. ORDER BY id — determinizm (docs/06 §9.3 #4).
   */
  private async onlineGamesForPeriod(
    timeCategory: TimeCategory,
    startsAt: Date,
    endsAt: Date,
  ): Promise<RatedGameRow[]> {
    const rows = await this.prisma.onlineGame.findMany({
      where: {
        isRated: true,
        timeCategory,
        endedAt: { gte: startsAt, lt: endsAt },
        status: { in: [...RATED_ONLINE_STATUSES] },
      },
      select: {
        id: true,
        status: true,
        winnerColor: true,
        whitePlayerId: true,
        blackPlayerId: true,
      },
      orderBy: { id: 'asc' },
    });

    return rows.flatMap((row) => {
      const result = onlineRatedResult(row.status, row.winnerColor);
      if (result === null) {
        return [];
      }
      return [
        {
          pairingId: row.id,
          whitePlayerId: row.whitePlayerId,
          blackPlayerId: row.blackPlayerId,
          result,
        },
      ];
    });
  }

  // --- PlayerRating ---------------------------------------------------------------

  async playersWithRatings(
    playerIds: readonly string[],
    environment: PlayEnvironment,
    timeCategory: TimeCategory,
  ): Promise<PlayerRatingRow[]> {
    if (playerIds.length === 0) {
      return [];
    }
    const rows = await this.prisma.playerRating.findMany({
      where: { playerId: { in: [...playerIds] }, environment, timeCategory },
    });
    return rows.map(toPlayerRatingRow);
  }

  /** Kategoriya bo'yicha BARCHA reytingli o'yinchilar — idle RD o'sishi uchun. */
  async allRatedPlayers(
    environment: PlayEnvironment,
    timeCategory: TimeCategory,
  ): Promise<PlayerRatingRow[]> {
    const rows = await this.prisma.playerRating.findMany({
      where: { environment, timeCategory },
    });
    return rows.map(toPlayerRatingRow);
  }

  /** Bitta o'yinchining joriy reytingi — RATING_PORT uchun. */
  async findPlayerRating(
    playerId: string,
    environment: PlayEnvironment,
    timeCategory: TimeCategory,
  ): Promise<PlayerRatingRow | null> {
    const row = await this.prisma.playerRating.findUnique({
      where: {
        playerId_environment_timeCategory: { playerId, environment, timeCategory },
      },
    });
    return row === null ? null : toPlayerRatingRow(row);
  }

  /** Davrning mavjud history yozuvlari — recompute'da davr-boshi holatini tiklash. */
  async priorHistoryForPeriod(periodId: string): Promise<PriorHistoryRow[]> {
    const rows = await this.prisma.ratingHistory.findMany({
      where: { periodId },
      select: {
        playerId: true,
        ratingBefore: true,
        deviationBefore: true,
        volatilityBefore: true,
        gamesInPeriod: true,
      },
    });
    return rows.map((r) => ({
      playerId: r.playerId,
      ratingBefore: r.ratingBefore.toNumber(),
      deviationBefore: r.deviationBefore.toNumber(),
      volatilityBefore: r.volatilityBefore.toNumber(),
      gamesInPeriod: r.gamesInPeriod,
    }));
  }

  // --- Davr natijasini qo'llash ------------------------------------------------

  /**
   * Davr natijalarini BITTA tranzaksiyada qo'llash:
   *
   *  1. `pg_try_advisory_xact_lock` — bir davr uchun bir vaqtda BITTA
   *     compute (docs/11-infrastructure.md §6.1 uslubi, outbox.publisher.ts
   *     pattern'i). Olinmasa → 409, chaqiruvchi keyinroq qaytadi.
   *  2. PlayerRating upsert — ABSOLYUT qiymatlar (delta emas) → qayta
   *     ishga tushirish bir xil holatga keladi (idempotentlik).
   *  3. RatingHistory — recompute'da eski yozuv O'CHIRILIB yangisi
   *     yoziladi (delete+insert): DB trigger'i `rating_history_no_update`
   *     UPDATE'ni taqiqlaydi (migration 20260723000001, docs/06 §8),
   *     @@unique([playerId, periodId, env, cat]) esa ikkinchi qatorni.
   *     Natija: bir davr × o'yinchi = bitta joriy yozuv; docs/06 §9
   *     superseded_by zanjiri keyingi bosqich vazifasi.
   *  4. Davr meta: computedAt/playersAffected/gamesProcessed;
   *     recomputeGeneration FAQAT allaqachon hisoblangan davr qayta
   *     hisoblanganda +1 (birinchi hisobda 0 qoladi).
   *  5. Audit 'rating.recalculated' (sabab MAJBURIY) + outbox
   *     'RatingRecomputed' — hammasi shu tranzaksiyada.
   */
  async applyPeriodResults(input: ApplyPeriodResultsInput): Promise<RatingPeriodRow> {
    const lockKey = periodLockKey(input.periodId);
    const now = new Date();

    return await this.prisma.$transaction(async (tx) => {
      const [lock] = await tx.$queryRaw<[{ locked: boolean }]>`
        SELECT pg_try_advisory_xact_lock(${lockKey}) AS locked
      `;
      if (!lock.locked) {
        throw new ConflictError('Bu davr uchun hisoblash allaqachon davom etmoqda', {
          periodId: input.periodId,
        });
      }

      const period = await tx.ratingPeriod.findUniqueOrThrow({
        where: { id: input.periodId },
      });
      const recomputeGeneration =
        period.computedAt === null ? period.recomputeGeneration : period.recomputeGeneration + 1;

      for (const result of input.results) {
        const ratingValues = {
          rating: result.after.rating,
          deviation: result.after.deviation,
          volatility: result.after.volatility,
          gamesPlayed: result.gamesPlayedTotal,
          isProvisional: result.isProvisional,
          peakRating: result.peakRating,
          lastPeriodId: input.periodId,
        };
        await tx.playerRating.upsert({
          where: {
            playerId_environment_timeCategory: {
              playerId: result.playerId,
              environment: input.environment,
              timeCategory: input.timeCategory,
            },
          },
          create: {
            playerId: result.playerId,
            environment: input.environment,
            timeCategory: input.timeCategory,
            ...ratingValues,
            peakRatingAt: result.peakChanged ? now : null,
          },
          update: {
            ...ratingValues,
            ...(result.peakChanged && { peakRatingAt: now }),
          },
        });

        // UPDATE emas — delete+insert (rating_history_no_update trigger'i
        // UPDATE'ni rad etadi; DELETE recompute uchun ochiq qoldirilgan).
        await tx.ratingHistory.deleteMany({
          where: {
            playerId: result.playerId,
            periodId: input.periodId,
            environment: input.environment,
            timeCategory: input.timeCategory,
          },
        });
        await tx.ratingHistory.create({
          data: {
            playerId: result.playerId,
            periodId: input.periodId,
            environment: input.environment,
            timeCategory: input.timeCategory,
            ratingBefore: result.before.rating,
            deviationBefore: result.before.deviation,
            volatilityBefore: result.before.volatility,
            ratingAfter: result.after.rating,
            deviationAfter: result.after.deviation,
            volatilityAfter: result.after.volatility,
            gamesInPeriod: result.gamesInPeriod,
            inputGames: result.inputGames as unknown as Prisma.InputJsonValue,
          },
        });
      }

      const updated = await tx.ratingPeriod.update({
        where: { id: input.periodId },
        data: {
          computedAt: now,
          playersAffected: input.results.length,
          gamesProcessed: input.gamesProcessed,
          recomputeGeneration,
        },
      });

      await this.audit.write(tx, {
        action: 'rating.recalculated',
        actorUserId: input.actorUserId,
        resourceType: 'RatingPeriod',
        resourceId: input.periodId,
        before: {
          computedAt: period.computedAt?.toISOString() ?? null,
          recomputeGeneration: period.recomputeGeneration,
        },
        after: {
          playersAffected: input.results.length,
          gamesProcessed: input.gamesProcessed,
          recomputeGeneration,
        },
        reason: input.reason,
      });

      await this.outbox.enqueue(tx, {
        eventType: 'RatingRecomputed',
        aggregateType: 'RatingPeriod',
        aggregateId: input.periodId,
        payload: {
          periodId: input.periodId,
          environment: input.environment,
          timeCategory: input.timeCategory,
          playersAffected: input.results.length,
          gamesProcessed: input.gamesProcessed,
          recomputeGeneration,
        },
      });

      return toPeriodRow(updated);
    });
  }

  // --- Ommaviy o'qishlar ----------------------------------------------------------

  /**
   * Leaderboard — reyting DESC bo'yicha keyset pagination.
   * Index: [environment, timeCategory, rating DESC] (prisma/schema.prisma).
   * Provisional KO'RSATILMAYDI (docs/06 §4.2), o'chirilgan o'yinchi ham.
   * Teng reytingda id ASC — barqaror tartib.
   */
  async leaderboard(
    environment: PlayEnvironment,
    timeCategory: TimeCategory,
    first: number,
    afterId: string | null,
  ): Promise<LeaderboardRow[]> {
    const cursor =
      afterId === null
        ? null
        : await this.prisma.playerRating.findUnique({
            where: { id: afterId },
            select: { id: true, rating: true },
          });

    const rows = await this.prisma.playerRating.findMany({
      where: {
        environment,
        timeCategory,
        isProvisional: false,
        player: { deletedAt: null },
        ...(cursor !== null && {
          OR: [{ rating: { lt: cursor.rating } }, { rating: cursor.rating, id: { gt: cursor.id } }],
        }),
      },
      orderBy: [{ rating: 'desc' }, { id: 'asc' }],
      take: first + 1,
      include: {
        player: { select: { firstName: true, lastName: true, title: true } },
      },
    });

    return rows.map((r) => ({
      id: r.id,
      playerId: r.playerId,
      firstName: r.player.firstName,
      lastName: r.player.lastName,
      title: r.player.title,
      rating: r.rating.toNumber(),
      deviation: r.deviation.toNumber(),
      gamesPlayed: r.gamesPlayed,
    }));
  }

  async historyForPlayer(
    playerId: string,
    filter: HistoryFilter,
    first: number,
    afterId: string | null,
  ): Promise<RatingHistoryRow[]> {
    const rows = await this.prisma.ratingHistory.findMany({
      where: {
        playerId,
        ...(filter.environment !== undefined && { environment: filter.environment }),
        ...(filter.timeCategory !== undefined && { timeCategory: filter.timeCategory }),
        ...(afterId !== null && { id: { gt: afterId } }),
      },
      // UUID v7 → id ASC = xronologik tartib (grafik uchun tabiiy).
      orderBy: { id: 'asc' },
      take: first + 1,
    });
    return rows.map(toHistoryRow);
  }
}

// --- Mapper'lar ---------------------------------------------------------------

function toPeriodRow(p: RatingPeriod): RatingPeriodRow {
  return {
    id: p.id,
    environment: p.environment,
    timeCategory: p.timeCategory,
    startsAt: p.startsAt,
    endsAt: p.endsAt,
    tau: p.tau.toNumber(),
    computedAt: p.computedAt,
    playersAffected: p.playersAffected,
    gamesProcessed: p.gamesProcessed,
    recomputeGeneration: p.recomputeGeneration,
    createdAt: p.createdAt,
  };
}

function toPlayerRatingRow(r: PlayerRating): PlayerRatingRow {
  return {
    id: r.id,
    playerId: r.playerId,
    environment: r.environment,
    timeCategory: r.timeCategory,
    rating: r.rating.toNumber(),
    deviation: r.deviation.toNumber(),
    volatility: r.volatility.toNumber(),
    gamesPlayed: r.gamesPlayed,
    isProvisional: r.isProvisional,
    peakRating: r.peakRating,
    peakRatingAt: r.peakRatingAt,
    lastPeriodId: r.lastPeriodId,
  };
}

function toHistoryRow(h: RatingHistory): RatingHistoryRow {
  return {
    id: h.id,
    playerId: h.playerId,
    periodId: h.periodId,
    environment: h.environment,
    timeCategory: h.timeCategory,
    ratingBefore: h.ratingBefore.toNumber(),
    deviationBefore: h.deviationBefore.toNumber(),
    volatilityBefore: h.volatilityBefore.toNumber(),
    ratingAfter: h.ratingAfter.toNumber(),
    deviationAfter: h.deviationAfter.toNumber(),
    volatilityAfter: h.volatilityAfter.toNumber(),
    gamesInPeriod: h.gamesInPeriod,
    inputGames: h.inputGames,
    createdAt: h.createdAt,
  };
}
