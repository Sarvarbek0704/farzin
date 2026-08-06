import { Inject, Injectable, Logger } from '@nestjs/common';

import {
  applyMove,
  createClock,
  remaining,
  type ClockConfig,
  type ClockSide,
  type ClockState,
} from '../../core/clock/chess-clock';
import {
  buildPgn,
  gameEndFromPosition,
  hasMatingMaterial,
  positionKey,
  sideToMove,
  validateMove,
  STARTING_FEN,
} from '../../core/chess/rules';
import {
  BusinessRuleError,
  ConflictError,
  NotFoundError,
} from '../../core/errors/domain.error';
import { PLAYER_PORT, type PlayerPort, type PlayerSummary } from '../player/player.port';
import { RATING_PORT, type RatingPort } from '../rating/rating.port';
import { ClockStore } from './clock.store';
import { PlayRepository, type FinishGameInput } from './play.repository';
import type {
  ClaimTimeoutResult,
  ClockPayload,
  ClockTypeValue,
  ColorValue,
  GameEndedPayload,
  GameErrorCode,
  GameRow,
  GameStatePayload,
  MoveResult,
  MoveRow,
  OnlineGameStatusValue,
  PlayerPayload,
  TimeCategoryValue,
} from './play.types';

/**
 * Play — o'yin hayot sikli (docs/07-realtime-and-clock.md).
 *
 * ═══════════════════════════════════════════════════════════════════════════
 *  YURISH PIPELINE'I (docs/07 §5.2 tartibi):
 *   vaqt o'lchash → rol → holat → navbat → soat (flag) → legal move →
 *   o'yin oxiri → persist (PostgreSQL, atomik) → Redis soat → broadcast
 *   (broadcast gateway'da — service transportni bilmaydi).
 *
 *  ATOMIKLIK VA TARTIB:
 *   1. PostgreSQL — chidamli haqiqat: Move + OnlineGame.fen (+ terminal
 *      holat + audit) BIR tranzaksiyada (play.repository).
 *   2. Redis — jonli soat keshi: DB muvaffaqiyatidan KEYIN yoziladi.
 *      CAS yiqilsa (parallel yozuv) yozuv O'CHIRILADI — keyingi o'qish
 *      Move.clockAfterMs'dan qayta tiklaydi (o'z-o'zini davolash,
 *      docs/02-architecture.md §8.2 ongli trade-off).
 *   3. Parallel yurish poygasi DB'da hal bo'ladi: @@unique([gameId, ply]).
 *
 *  SOAT BOSHLANISHI: o'yin yaratilishda ACTIVE (PENDING→ACTIVE ulanish
 *  kuzatuvi — keyingi bosqich). Oqning 1-yurishi BEPUL — soat oqning
 *  birinchi yurishidan KEYIN ishga tushadi (docs/07 §3.8: birinchi
 *  yurishgacha abort oynasi bor; §4 holat mashinasi). Bepul yurishda
 *  increment ham berilmaydi (increment faqat soat yuritilgan yurishdan
 *  keyin — chess-clock.spec property'si).
 *
 *  DURANG SODDALASHTIRISHLARI (docs/07 §6.4 dan ONGLI chetlanish,
 *  rules.gameEndFromPosition hujjatida ham): threefold (3x) va 50-yurish
 *  (100 ply) birinchi bo'lakda AVTOMATIK durang — claim tugmasi keyin.
 * ═══════════════════════════════════════════════════════════════════════════
 */

export interface CreateChallengeInput {
  opponentPlayerId: string;
  timeCategory: TimeCategoryValue;
  clockType: ClockTypeValue;
  baseTimeSeconds: number;
  incrementSeconds: number;
}

@Injectable()
export class PlayService {
  private readonly logger = new Logger(PlayService.name);

  constructor(
    private readonly repo: PlayRepository,
    private readonly clocks: ClockStore,
    @Inject(PLAYER_PORT) private readonly players: PlayerPort,
    @Inject(RATING_PORT) private readonly ratings: RatingPort,
  ) {}

  // --- Yaratish -----------------------------------------------------------------

  /**
   * Do'stona chaqiriq — muayyan raqibga qarshi o'yin (havola orqali
   * ulashiladi, docs/14-roadmap.md Faza 5 "Do'st bilan o'yin").
   *
   * Qarorlar (birinchi bo'lak):
   *  - chaqiruvchi OQ o'ynaydi (tasodifiy rang — keyin);
   *  - do'stona o'yin reytingga KIRMAYDI (schema: "Do'stona o'yin → false");
   *  - o'yin darhol ACTIVE.
   */
  async createFriendChallenge(
    actorUserId: string,
    input: CreateChallengeInput,
  ): Promise<GameStatePayload> {
    const me = await this.players.findSummaryByUserId(actorUserId);
    if (me === null) {
      throw new BusinessRuleError(
        'PLAYER_PROFILE_REQUIRED',
        "O'yin yaratish uchun o'yinchi profili kerak",
      );
    }
    const opponent = await this.players.findById(input.opponentPlayerId);
    if (opponent === null) {
      throw new NotFoundError('Player', input.opponentPlayerId);
    }
    if (opponent.id === me.id) {
      throw new BusinessRuleError('SELF_CHALLENGE', "O'zingizga qarshi o'ynay olmaysiz");
    }

    const game = await this.createGameWithClock({
      whitePlayerId: me.id,
      blackPlayerId: opponent.id,
      timeCategory: input.timeCategory,
      clockType: input.clockType,
      baseTimeSeconds: input.baseTimeSeconds,
      incrementSeconds: input.incrementSeconds,
      isRated: false,
    });
    return await this.getGameView(game.id, actorUserId);
  }

  /** Matchmaking ham shu yo'ldan o'yin yaratadi (matchmaking.service). */
  async createGameWithClock(input: {
    whitePlayerId: string;
    blackPlayerId: string;
    timeCategory: TimeCategoryValue;
    clockType: ClockTypeValue;
    baseTimeSeconds: number;
    incrementSeconds: number;
    isRated: boolean;
  }): Promise<GameRow> {
    const game = await this.repo.createGame(input);
    // Soat yozuvi darhol yaratiladi; oqning 1-yurishi baribir bepul.
    await this.clocks.init(game.id, createClock(clockConfig(game), 'w', Date.now()));
    return game;
  }

  // --- O'qish ---------------------------------------------------------------------

  /** Ommaviy tomoshabin ko'rinishi + o'yinchi uchun viewerRole (docs/07 §8.1 snapshot). */
  async getGameView(gameId: string, viewerUserId?: string | null): Promise<GameStatePayload> {
    const game = await this.repo.findGame(gameId);
    if (game === null) {
      throw new NotFoundError('OnlineGame', gameId);
    }
    const moves = await this.repo.listMoves(gameId);
    const now = Date.now();

    let viewerRole: GameStatePayload['viewerRole'] = 'spectator';
    if (viewerUserId != null) {
      const viewer = await this.players.findSummaryByUserId(viewerUserId);
      if (viewer?.id === game.whitePlayerId) {
        viewerRole = 'white';
      } else if (viewer?.id === game.blackPlayerId) {
        viewerRole = 'black';
      }
    }

    const [summaries, whiteRating, blackRating] = await Promise.all([
      this.players.findManyByIds([game.whitePlayerId, game.blackPlayerId]),
      this.ratings.getCurrentRating(game.whitePlayerId, 'ONLINE', game.timeCategory),
      this.ratings.getCurrentRating(game.blackPlayerId, 'ONLINE', game.timeCategory),
    ]);

    const drawOfferFrom =
      game.status === 'ACTIVE' ? await this.clocks.getDrawOffer(gameId) : null;

    return {
      gameId: game.id,
      status: game.status,
      fen: game.fen,
      moves: moves.map((m) => m.san),
      ply: game.plyCount,
      clock: await this.clockPayloadFor(game, moves, now),
      timeCategory: game.timeCategory,
      clockType: game.clockType,
      baseTimeSeconds: game.baseTimeSeconds,
      incrementSeconds: game.incrementSeconds,
      white: toPlayerPayload(game.whitePlayerId, summaries, whiteRating?.rating ?? 1500),
      black: toPlayerPayload(game.blackPlayerId, summaries, blackRating?.rating ?? 1500),
      viewerRole,
      drawOfferFrom,
      winnerColor: game.winnerColor,
      isRated: game.isRated,
    };
  }

  async listActiveGamesFor(userId: string): Promise<GameRow[]> {
    const me = await this.players.findSummaryByUserId(userId);
    if (me === null) {
      return [];
    }
    return await this.repo.listActiveForPlayer(me.id);
  }

  // --- Yurish ---------------------------------------------------------------------

  async makeMove(userId: string, gameId: string, uci: string): Promise<MoveResult> {
    // 1. Vaqtni ENG BIRINCHI o'lchaymiz (docs/07 §5.2 1-qadam).
    const now = Date.now();

    const game = await this.repo.findGame(gameId);
    if (game?.status !== 'ACTIVE') {
      return reject('game_not_active', "O'yin topilmadi yoki faol emas");
    }

    // 2. Rol — tomoshabin yurolmaydi (docs/07 §2.2 #6).
    const side = await this.sideOf(userId, game);
    if (side === null) {
      return reject('not_a_player', "Siz bu o'yinning o'yinchisi emassiz");
    }

    // 3. Navbat (docs/07 §5.2 4-qadam).
    if (sideToMove(game.fen) !== side) {
      return reject('not_your_turn', 'Navbat sizda emas', game.fen);
    }

    const config = clockConfig(game);
    const ply = game.plyCount + 1;

    // 4. Soat (docs/07 §5.2 6-qadam). Oqning 1-yurishi BEPUL (§3.8).
    let newClock: ClockState;
    let entryVersion: number | null = null;
    let elapsedMs = 0;

    if (ply === 1) {
      newClock = {
        whiteRemainingMs: config.baseMs,
        blackRemainingMs: config.baseMs,
        turn: 'b',
        lastEventAtMs: now,
      };
    } else {
      const entry = await this.clocks.load(gameId);
      const state = entry?.state ?? this.reconstructClock(game, await this.repo.listMoves(gameId), now);
      entryVersion = entry?.version ?? null;

      const applied = applyMove(config, state, now);
      if (applied.flagged) {
        // Vaqt tugagan — yurish RAD, o'yin TIMEOUT bilan tugaydi (FIDE 6.9
        // tekshiruvi bilan). docs/07 §3.5.
        const ended = await this.finishByTimeout(game, side, applied.state, userId);
        return {
          ok: false,
          code: 'clock_expired',
          message: 'Vaqtingiz tugadi',
          resyncFen: game.fen,
          ...(ended !== null && { ended }),
        };
      }
      newClock = applied.state;
      elapsedMs = applied.elapsedMs;
    }

    // 5. Legal move — chess.js (docs/07 §5.2 7-qadam).
    const validated = validateMove(game.fen, uci);
    if (!validated.legal) {
      return reject('illegal_move', 'Noqonuniy yurish', game.fen);
    }

    // 6. O'yin oxiri (docs/07 §5.2 9-qadam + §6).
    let endStatus = gameEndFromPosition(validated.fenAfter);
    if (endStatus === null && !validated.irreversible) {
      // Threefold — Zobrist indeks + FIDE 9.2 kaliti bilan qayta tekshiruv
      // (docs/07 §6.2 kollizion himoyasi). Boshlang'ich pozitsiya ham sanaladi.
      const occurrences = await this.repo.positionOccurrences(gameId, validated.positionHash);
      const key = positionKey(validated.fenAfter);
      const inHistory = occurrences.filter((fen) => positionKey(fen) === key).length;
      const startBonus = positionKey(STARTING_FEN) === key ? 1 : 0;
      if (inHistory + startBonus + 1 >= 3) {
        endStatus = 'THREEFOLD_REPETITION';
      }
    }

    const moverColor: ColorValue = side === 'w' ? 'WHITE' : 'BLACK';
    const winnerColor: ColorValue | null = endStatus === 'CHECKMATE' ? moverColor : null;

    // 7. Persist — Move + fen (+ terminal + audit) BIR tranzaksiyada.
    let finish: FinishGameInput | null = null;
    if (endStatus !== null) {
      const priorSans = (await this.repo.listMoves(gameId)).map((m) => m.san);
      finish = {
        status: endStatus,
        winnerColor,
        whiteTimeLeftMs: newClock.whiteRemainingMs,
        blackTimeLeftMs: newClock.blackRemainingMs,
        pgn: buildPgn([...priorSans, validated.san], pgnResult(endStatus, winnerColor)),
        actorUserId: userId,
      };
    }

    try {
      await this.repo.appendMove(
        gameId,
        {
          ply,
          san: validated.san,
          uci: validated.uci,
          fenAfter: validated.fenAfter,
          positionHash: validated.positionHash,
          thinkTimeMs: ply === 1 ? null : elapsedMs,
          clockAfterMs: side === 'w' ? newClock.whiteRemainingMs : newClock.blackRemainingMs,
        },
        finish,
      );
    } catch (e) {
      if (e instanceof ConflictError) {
        return reject('stale_seq', 'Yurish allaqachon qabul qilingan', game.fen);
      }
      throw e;
    }

    // 8. Redis soat — DB'dan KEYIN (tepadagi tartib hujjatiga qarang).
    if (endStatus !== null) {
      await this.clocks.clear(gameId);
    } else if (ply === 1 || entryVersion === null) {
      await this.clocks.init(gameId, newClock);
    } else {
      const casOk = await this.clocks.update(gameId, entryVersion, newClock);
      if (!casOk) {
        this.logger.warn(`clock CAS conflict, self-heal: game=${gameId} ply=${String(ply)}`);
        await this.clocks.clear(gameId);
      }
    }

    // Har yurishda faol durang taklifi bekor bo'ladi (yurish = rad).
    if (endStatus === null) {
      await this.clocks.clearDrawOffer(gameId);
    }

    const clock = toClockPayload(newClock, endStatus !== null, now);
    return {
      ok: true,
      move: {
        gameId,
        ply,
        san: validated.san,
        uci: validated.uci,
        fen: validated.fenAfter,
        clock,
        msSpent: ply === 1 ? 0 : elapsedMs,
      },
      ended:
        endStatus === null
          ? null
          : {
              gameId,
              status: endStatus,
              winnerColor,
              finalFen: validated.fenAfter,
              clock,
            },
    };
  }

  // --- Taslim / durang / abort / claim ---------------------------------------------

  async resign(userId: string, gameId: string): Promise<GameEndedPayload> {
    const { game, side } = await this.requireActivePlayer(userId, gameId);
    const winner: ColorValue = side === 'w' ? 'BLACK' : 'WHITE';
    return await this.finishNoMove(game, 'RESIGNATION', winner, userId);
  }

  /** Durang taklifi — Redis bayrog'i (docs/07 §7.2). Qaytgan qiymat: kim taklif qildi. */
  async offerDraw(userId: string, gameId: string): Promise<{ from: ClockSide }> {
    const { side } = await this.requireActivePlayer(userId, gameId);
    await this.clocks.setDrawOffer(gameId, side);
    return { from: side };
  }

  async acceptDraw(userId: string, gameId: string): Promise<GameEndedPayload> {
    const { game, side } = await this.requireActivePlayer(userId, gameId);
    const offer = await this.clocks.getDrawOffer(gameId);
    if (offer === null || offer === side) {
      throw new BusinessRuleError('NO_DRAW_OFFER', 'Qabul qilinadigan durang taklifi yo\'q');
    }
    return await this.finishNoMove(game, 'DRAW_AGREED', null, userId);
  }

  /**
   * Abort — 2-yurishgacha (docs/07 §4: active → aborted "faqat
   * 1-yurishgacha"; §3.8 abort oynasi). Reytingga ta'sir qilmaydi.
   */
  async abort(userId: string, gameId: string): Promise<GameEndedPayload> {
    const { game } = await this.requireActivePlayer(userId, gameId);
    if (game.plyCount >= 2) {
      throw new BusinessRuleError('ABORT_WINDOW_CLOSED', 'Abort oynasi yopilgan (2-yurishdan keyin)');
    }
    return await this.finishNoMove(game, 'ABORTED', null, userId);
  }

  /**
   * "Raqib vaqti tugadi" DA'VOSI — e'lon emas, so'rov (docs/07 §3.5):
   * server o'z soatini tekshiradi va RAD ETISHI mumkin (time_remains).
   */
  async claimTimeout(userId: string, gameId: string): Promise<ClaimTimeoutResult> {
    const now = Date.now();
    const { game, side } = await this.requireActivePlayer(userId, gameId);
    const opponent: ClockSide = side === 'w' ? 'b' : 'w';
    const config = clockConfig(game);

    if (game.plyCount === 0) {
      // Soat hali ishga tushmagan (oqning 1-yurishi bepul) — flag imkonsiz.
      return { accepted: false, remainingMs: config.baseMs };
    }

    const entry = await this.clocks.load(gameId);
    const state =
      entry?.state ?? this.reconstructClock(game, await this.repo.listMoves(gameId), now);
    const rem = remaining(config, state, opponent, now);
    if (rem > 0) {
      return { accepted: false, remainingMs: rem };
    }

    const flaggedState: ClockState = {
      whiteRemainingMs: opponent === 'w' ? 0 : state.whiteRemainingMs,
      blackRemainingMs: opponent === 'b' ? 0 : state.blackRemainingMs,
      turn: state.turn,
      lastEventAtMs: state.lastEventAtMs,
    };
    const ended = await this.finishByTimeout(game, opponent, flaggedState, userId);
    if (ended === null) {
      return { accepted: false };
    }
    return { accepted: true, ended };
  }

  // --- Ichki yordamchilar ------------------------------------------------------------

  private async sideOf(userId: string, game: GameRow): Promise<ClockSide | null> {
    const me = await this.players.findSummaryByUserId(userId);
    if (me === null) {
      return null;
    }
    if (me.id === game.whitePlayerId) {
      return 'w';
    }
    if (me.id === game.blackPlayerId) {
      return 'b';
    }
    return null;
  }

  private async requireActivePlayer(
    userId: string,
    gameId: string,
  ): Promise<{ game: GameRow; side: ClockSide }> {
    const game = await this.repo.findGame(gameId);
    if (game === null) {
      throw new NotFoundError('OnlineGame', gameId);
    }
    if (game.status !== 'ACTIVE') {
      throw new BusinessRuleError('GAME_NOT_ACTIVE', "O'yin faol emas");
    }
    const side = await this.sideOf(userId, game);
    if (side === null) {
      // deny→404: begona uchun o'yin ustidagi amal "yo'q narsa" (docs/04 §2.4).
      throw new NotFoundError('OnlineGame', gameId);
    }
    return { game, side };
  }

  /**
   * FIDE 6.9 (docs/07 §3.5): flag tushdi, lekin G'OLIBDA mot qilish uchun
   * material bo'lmasa — DURANG (TIMEOUT_VS_INSUFFICIENT_MATERIAL),
   * mag'lubiyat emas. hasMatingMaterial — isDeadPosition EMAS (§6.5).
   */
  private async finishByTimeout(
    game: GameRow,
    loser: ClockSide,
    finalClock: ClockState,
    actorUserId: string,
  ): Promise<GameEndedPayload | null> {
    const winner: ClockSide = loser === 'w' ? 'b' : 'w';
    const winnerHasMaterial = hasMatingMaterial(game.fen, winner);
    const status: OnlineGameStatusValue = winnerHasMaterial
      ? 'TIMEOUT'
      : 'TIMEOUT_VS_INSUFFICIENT_MATERIAL';
    const winnerColor: ColorValue | null = winnerHasMaterial
      ? winner === 'w'
        ? 'WHITE'
        : 'BLACK'
      : null;

    const sans = (await this.repo.listMoves(game.id)).map((m) => m.san);
    const row = await this.repo.finishGame(game.id, {
      status,
      winnerColor,
      whiteTimeLeftMs: finalClock.whiteRemainingMs,
      blackTimeLeftMs: finalClock.blackRemainingMs,
      pgn: buildPgn(sans, pgnResult(status, winnerColor)),
      actorUserId,
    });
    if (row === null) {
      return null; // allaqachon tugagan — idempotentlik (docs/07 §4)
    }
    await this.clocks.clear(game.id);
    return {
      gameId: game.id,
      status,
      winnerColor,
      finalFen: game.fen,
      clock: toClockPayload(finalClock, true, Date.now()),
    };
  }

  private async finishNoMove(
    game: GameRow,
    status: OnlineGameStatusValue,
    winnerColor: ColorValue | null,
    actorUserId: string,
  ): Promise<GameEndedPayload> {
    const now = Date.now();
    const moves = await this.repo.listMoves(game.id);
    const config = clockConfig(game);
    const entry = await this.clocks.load(game.id);
    const state = entry?.state ?? this.reconstructClock(game, moves, now);

    // Yakuniy soat: yuruvchi tomonning jonli qiymati "hozir" kesimida.
    const finalState: ClockState = {
      whiteRemainingMs:
        game.plyCount === 0 ? config.baseMs : remaining(config, state, 'w', now),
      blackRemainingMs:
        game.plyCount === 0 ? config.baseMs : remaining(config, state, 'b', now),
      turn: state.turn,
      lastEventAtMs: now,
    };

    const row = await this.repo.finishGame(game.id, {
      status,
      winnerColor,
      whiteTimeLeftMs: finalState.whiteRemainingMs,
      blackTimeLeftMs: finalState.blackRemainingMs,
      pgn: buildPgn(
        moves.map((m) => m.san),
        pgnResult(status, winnerColor),
      ),
      actorUserId,
    });
    if (row === null) {
      throw new BusinessRuleError('GAME_NOT_ACTIVE', "O'yin allaqachon tugagan");
    }
    await this.clocks.clear(game.id);
    return {
      gameId: game.id,
      status,
      winnerColor,
      finalFen: game.fen,
      clock: toClockPayload(finalState, true, now),
    };
  }

  /**
   * Redis yozuvi yo'qolganda soatni Move.clockAfterMs'dan TAXMINIY tiklash
   * (docs/02-architecture.md §8.2 tan olingan trade-off). Oxirgi yurishdan
   * beri o'tgan vaqt O'YINCHIDAN OLINMAYDI — lastEventAtMs = hozir
   * (docs/07 §8.3: server nosozligi uchun o'yinchi jazolanmaydi).
   */
  private reconstructClock(game: GameRow, moves: readonly MoveRow[], nowMs: number): ClockState {
    const config = clockConfig(game);
    let whiteMs = config.baseMs;
    let blackMs = config.baseMs;
    for (const m of moves) {
      if (m.clockAfterMs === null) {
        continue;
      }
      if (m.ply % 2 === 1) {
        whiteMs = m.clockAfterMs;
      } else {
        blackMs = m.clockAfterMs;
      }
    }
    this.logger.warn(`clock reconstructed from move log: game=${game.id}`);
    return {
      whiteRemainingMs: whiteMs,
      blackRemainingMs: blackMs,
      turn: sideToMove(game.fen),
      lastEventAtMs: nowMs,
    };
  }

  /** GameStatePayload uchun soat: ACTIVE bo'lsa jonli, aks holda yakuniy PG qiymatlari. */
  private async clockPayloadFor(
    game: GameRow,
    moves: readonly MoveRow[],
    now: number,
  ): Promise<ClockPayload> {
    const config = clockConfig(game);
    if (game.status !== 'ACTIVE') {
      return {
        whiteMs: game.whiteTimeLeftMs ?? config.baseMs,
        blackMs: game.blackTimeLeftMs ?? config.baseMs,
        running: null,
        serverSentAtMs: now,
      };
    }
    if (game.plyCount === 0) {
      // Soat hali yurmaydi — oqning 1-yurishi bepul (§3.8).
      return { whiteMs: config.baseMs, blackMs: config.baseMs, running: null, serverSentAtMs: now };
    }
    const entry = await this.clocks.load(game.id);
    const state = entry?.state ?? this.reconstructClock(game, moves, now);
    return {
      whiteMs: remaining(config, state, 'w', now),
      blackMs: remaining(config, state, 'b', now),
      running: state.turn,
      serverSentAtMs: now,
    };
  }
}

// --- Sof yordamchilar --------------------------------------------------------------

export function clockConfig(game: {
  clockType: ClockTypeValue;
  baseTimeSeconds: number;
  incrementSeconds: number;
}): ClockConfig {
  return {
    clockType: game.clockType,
    baseMs: game.baseTimeSeconds * 1000,
    incrementMs: game.incrementSeconds * 1000,
  };
}

function toClockPayload(state: ClockState, stopped: boolean, nowMs: number): ClockPayload {
  return {
    whiteMs: state.whiteRemainingMs,
    blackMs: state.blackRemainingMs,
    running: stopped ? null : state.turn,
    serverSentAtMs: nowMs,
  };
}

function toPlayerPayload(
  playerId: string,
  summaries: readonly PlayerSummary[],
  rating: number,
): PlayerPayload {
  const s = summaries.find((x) => x.id === playerId);
  return {
    playerId,
    firstName: s?.firstName ?? '',
    lastName: s?.lastName ?? '',
    title: s?.title ?? null,
    rating,
  };
}

/** PGN natija belgisi (docs/07 §4 GameOutcome.pgnResult). */
function pgnResult(
  status: OnlineGameStatusValue,
  winnerColor: ColorValue | null,
): '1-0' | '0-1' | '1/2-1/2' | '*' {
  if (status === 'ABORTED' || status === 'PENDING' || status === 'ACTIVE') {
    return '*';
  }
  if (winnerColor === 'WHITE') {
    return '1-0';
  }
  if (winnerColor === 'BLACK') {
    return '0-1';
  }
  return '1/2-1/2';
}

function reject(code: GameErrorCode, message: string, resyncFen?: string): MoveResult {
  return { ok: false, code, message, ...(resyncFen !== undefined && { resyncFen }) };
}
