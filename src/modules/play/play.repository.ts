import { Injectable } from '@nestjs/common';
import { Prisma, type Move, type OnlineGame } from '@prisma/client';

import { ConflictError } from '../../core/errors/domain.error';
import { AuditService } from '../../shared/audit/audit.service';
import { PrismaService } from '../../shared/prisma/prisma.service';
import type {
  ClockTypeValue,
  ColorValue,
  GameRow,
  MoveRow,
  OnlineGameStatusValue,
  TimeCategoryValue,
} from './play.types';

/**
 * Play ma'lumot qatlami — Prisma FAQAT shu faylda
 * (.dependency-cruiser.js `prisma-only-in-infrastructure`).
 *
 * Yozuv tartibi (docs/02-architecture.md §8.2): har yurish Move jadvaliga
 * DARHOL yoziladi (clockAfterMs bilan) — Redis yo'qolsa o'yin shu logdan
 * tiklanadi. Yakuniy holat (status, winnerColor, soatlar, PGN) o'yin
 * tugaganda OnlineGame'ga yoziladi.
 *
 * IDEMPOTENTLIK (docs/07 §4): terminal holatga o'tish
 * `updateMany WHERE status = ACTIVE` optimistic lock bilan — bir vaqtda
 * flag ham, resign ham kelsa FAQAT bittasi yutadi. Parallel yurishlar esa
 * `@@unique([gameId, ply])` bilan to'siladi.
 */

export interface CreateGameInput {
  whitePlayerId: string;
  blackPlayerId: string;
  timeCategory: TimeCategoryValue;
  clockType: ClockTypeValue;
  baseTimeSeconds: number;
  incrementSeconds: number;
  isRated: boolean;
}

export interface AppendMoveInput {
  ply: number;
  san: string;
  uci: string;
  fenAfter: string;
  positionHash: string;
  thinkTimeMs: number | null;
  clockAfterMs: number | null;
}

export interface FinishGameInput {
  status: OnlineGameStatusValue;
  winnerColor: ColorValue | null;
  whiteTimeLeftMs: number;
  blackTimeLeftMs: number;
  pgn: string;
  /** Audit uchun: kim harakat qildi (server qarori bo'lsa null). */
  actorUserId: string | null;
}

@Injectable()
export class PlayRepository {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  async createGame(input: CreateGameInput): Promise<GameRow> {
    const created = await this.prisma.onlineGame.create({
      data: {
        whitePlayerId: input.whitePlayerId,
        blackPlayerId: input.blackPlayerId,
        // Birinchi bo'lak qarori: o'yin yaratilishi bilan ACTIVE —
        // PENDING→ACTIVE ulanish kuzatuvi (docs/07 §4) keyingi bosqich.
        status: 'ACTIVE',
        timeCategory: input.timeCategory,
        clockType: input.clockType,
        baseTimeSeconds: input.baseTimeSeconds,
        incrementSeconds: input.incrementSeconds,
        isRated: input.isRated,
        startedAt: new Date(),
      },
    });
    return toGameRow(created, 0);
  }

  async findGame(id: string): Promise<GameRow | null> {
    const row = await this.prisma.onlineGame.findUnique({
      where: { id },
      include: { _count: { select: { moves: true } } },
    });
    return row === null ? null : toGameRow(row, row._count.moves);
  }

  async listMoves(gameId: string): Promise<MoveRow[]> {
    const rows = await this.prisma.move.findMany({
      where: { gameId },
      orderBy: { ply: 'asc' },
    });
    return rows.map(toMoveRow);
  }

  /**
   * Threefold uchun: shu o'yinda AYNI positionHash bilan yozilgan
   * pozitsiyalar. Kollizion himoyasi (docs/07 §6.2): chaqiruvchi qaytgan
   * fenAfter'larni FIDE 9.2 kaliti bilan QAYTA tekshiradi.
   */
  async positionOccurrences(gameId: string, positionHash: string): Promise<string[]> {
    const rows = await this.prisma.move.findMany({
      where: { gameId, positionHash },
      select: { fenAfter: true },
    });
    return rows.map((r) => r.fenAfter);
  }

  /**
   * Yurishni qo'shish — Move + OnlineGame.fen BIR tranzaksiyada.
   * `finish` berilsa terminal holat + audit ham SHU tranzaksiyada
   * (yarim-tugagan o'yin holati mumkin emas).
   *
   * Poyga himoyasi: @@unique([gameId, ply]) — ikkinchi parallel yurish
   * P2002 bilan yiqiladi → ConflictError (gateway 'stale_seq' deb qaytaradi).
   */
  async appendMove(
    gameId: string,
    move: AppendMoveInput,
    finish: FinishGameInput | null,
  ): Promise<void> {
    try {
      await this.prisma.$transaction(async (tx) => {
        await tx.move.create({
          data: {
            gameId,
            ply: move.ply,
            san: move.san,
            uci: move.uci,
            fenAfter: move.fenAfter,
            positionHash: move.positionHash,
            thinkTimeMs: move.thinkTimeMs,
            clockAfterMs: move.clockAfterMs,
          },
        });

        const data: Prisma.OnlineGameUpdateManyMutationInput =
          finish === null
            ? { fen: move.fenAfter }
            : {
                fen: move.fenAfter,
                status: finish.status,
                winnerColor: finish.winnerColor,
                whiteTimeLeftMs: finish.whiteTimeLeftMs,
                blackTimeLeftMs: finish.blackTimeLeftMs,
                pgn: finish.pgn,
                endedAt: new Date(),
              };

        const updated = await tx.onlineGame.updateMany({
          where: { id: gameId, status: 'ACTIVE' },
          data,
        });
        if (updated.count === 0) {
          throw new ConflictError("O'yin faol emas — yurish qabul qilinmadi", { gameId });
        }

        if (finish !== null) {
          await this.audit.write(tx, {
            action: 'game.finished',
            actorUserId: finish.actorUserId,
            resourceType: 'OnlineGame',
            resourceId: gameId,
            after: {
              status: finish.status,
              winnerColor: finish.winnerColor,
              endPly: move.ply,
              whiteTimeLeftMs: finish.whiteTimeLeftMs,
              blackTimeLeftMs: finish.blackTimeLeftMs,
            },
          });
        }
      });
    } catch (e) {
      if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002') {
        // Parallel yurish poygasi — bitta ply ikki marta (docs/07 §2.2 #5).
        throw new ConflictError("Yurish allaqachon qabul qilingan (parallel so'rov)", {
          gameId,
          ply: move.ply,
        });
      }
      throw e;
    }
  }

  /**
   * Yurishsiz tugatish (resign / draw / timeout / abort / abandon).
   *
   * Idempotent: o'yin allaqachon terminal bo'lsa `null` qaytadi (docs/07 §4
   * "finished ga o'tish bir marta bajariladi") — chaqiruvchi broadcast'ni
   * takrorlamaydi. Audit 'game.finished' BIR tranzaksiyada.
   */
  async finishGame(gameId: string, finish: FinishGameInput): Promise<GameRow | null> {
    return await this.prisma.$transaction(async (tx) => {
      const updated = await tx.onlineGame.updateMany({
        where: { id: gameId, status: 'ACTIVE' },
        data: {
          status: finish.status,
          winnerColor: finish.winnerColor,
          whiteTimeLeftMs: finish.whiteTimeLeftMs,
          blackTimeLeftMs: finish.blackTimeLeftMs,
          pgn: finish.pgn,
          endedAt: new Date(),
        },
      });
      if (updated.count === 0) {
        return null;
      }

      await this.audit.write(tx, {
        action: 'game.finished',
        actorUserId: finish.actorUserId,
        resourceType: 'OnlineGame',
        resourceId: gameId,
        after: {
          status: finish.status,
          winnerColor: finish.winnerColor,
          whiteTimeLeftMs: finish.whiteTimeLeftMs,
          blackTimeLeftMs: finish.blackTimeLeftMs,
        },
      });

      const row = await tx.onlineGame.findUniqueOrThrow({
        where: { id: gameId },
        include: { _count: { select: { moves: true } } },
      });
      return toGameRow(row, row._count.moves);
    });
  }

  /** O'yinchining faol o'yinlari — istalgan rangda. */
  async listActiveForPlayer(playerId: string): Promise<GameRow[]> {
    const rows = await this.prisma.onlineGame.findMany({
      where: {
        status: 'ACTIVE',
        OR: [{ whitePlayerId: playerId }, { blackPlayerId: playerId }],
      },
      orderBy: { createdAt: 'desc' },
      include: { _count: { select: { moves: true } } },
    });
    return rows.map((r) => toGameRow(r, r._count.moves));
  }

  /**
   * `farzin_active_games{type="online"}` manbai
   * (docs/15-observability.md §3.3). Arzon COUNT — `status` ustunida
   * indeks bor va faol o'yinlar soni har doim kichik.
   */
  async countActiveGames(): Promise<number> {
    return await this.prisma.onlineGame.count({ where: { status: 'ACTIVE' } });
  }

  /**
   * Uzoq vaqt QIMIRLAMAGAN faol o'yinlar — flag supurgichi uchun
   * (docs/07 §3.5 proaktiv yo'lning ko'p instansli xavfsizlik tarmog'i).
   *
   * NEGA `updatedAt` bo'yicha filtr: soat faqat yurish bilan yangilanadi,
   * ya'ni har yurishda `updatedAt` ko'tariladi. Yaqinda yurish bo'lgan
   * o'yinning vaqti tugagan bo'lishi mumkin emas (eng qisqa nazoratda
   * ham), shuning uchun ular skanerdan chiqariladi va supurgich arzon
   * qoladi.
   *
   * `plyCount = 0` — oqning birinchi yurishi BEPUL (docs/07 §3.8), soat
   * hali yurmagan: bunday o'yinda flag bo'lishi mumkin emas.
   */
  async listStaleActiveGameIds(idleForMs: number, limit: number): Promise<string[]> {
    const rows = await this.prisma.onlineGame.findMany({
      where: {
        status: 'ACTIVE',
        updatedAt: { lt: new Date(Date.now() - idleForMs) },
        moves: { some: {} },
      },
      select: { id: true },
      orderBy: { updatedAt: 'asc' },
      take: limit,
    });
    return rows.map((r) => r.id);
  }
}

// --- Mapper'lar -----------------------------------------------------------------

function toGameRow(g: OnlineGame, plyCount: number): GameRow {
  return {
    id: g.id,
    whitePlayerId: g.whitePlayerId,
    blackPlayerId: g.blackPlayerId,
    status: g.status,
    timeCategory: g.timeCategory,
    clockType: g.clockType,
    baseTimeSeconds: g.baseTimeSeconds,
    incrementSeconds: g.incrementSeconds,
    fen: g.fen,
    pgn: g.pgn,
    winnerColor: g.winnerColor,
    whiteTimeLeftMs: g.whiteTimeLeftMs,
    blackTimeLeftMs: g.blackTimeLeftMs,
    isRated: g.isRated,
    startedAt: g.startedAt,
    endedAt: g.endedAt,
    createdAt: g.createdAt,
    plyCount,
  };
}

function toMoveRow(m: Move): MoveRow {
  return {
    ply: m.ply,
    san: m.san,
    uci: m.uci,
    fenAfter: m.fenAfter,
    positionHash: m.positionHash,
    thinkTimeMs: m.thinkTimeMs,
    clockAfterMs: m.clockAfterMs,
  };
}
