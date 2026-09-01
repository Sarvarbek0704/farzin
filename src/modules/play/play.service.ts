import { Inject, Injectable, Logger } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { Interval } from '@nestjs/schedule';

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
import { BusinessRuleError, ConflictError, NotFoundError } from '../../core/errors/domain.error';
import { MetricsService } from '../../shared/metrics/metrics.service';
import { PLAYER_PORT, type PlayerPort, type PlayerSummary } from '../player/player.port';
import { RATING_PORT, type RatingPort } from '../rating/rating.port';
import { ClockStore } from './clock.store';
import { PlayRepository, type FinishGameInput } from './play.repository';
import { assertTimeCategoryMatches } from './time-control.guard';
import {
  PLAY_GAME_FINISHED_EVENT,
  type ClaimTimeoutResult,
  type ClockPayload,
  type ClockTypeValue,
  type ColorValue,
  type FlagCheckResult,
  type GameEndedPayload,
  type GameErrorCode,
  type GameRow,
  type GameStatePayload,
  type MoveResult,
  type MoveRow,
  type OnlineGameStatusValue,
  type PlayerPayload,
  type PlayGameFinishedEvent,
  type TimeCategoryValue,
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
 *
 *  HAYOT SIKLI TAYMERLARI (Faza 5 DoD yakuni):
 *   - PROAKTIV FLAG (§3.5 2-yo'l) — checkFlag(); taymer gateway'da
 *     (game-timers.ts), har yurishda qayta qo'yiladi. Reaktiv claim yo'li
 *     (claimTimeout) saqlanadi — ikkalasi ham kerak (§3.5).
 *   - DISKONNEKT/ABANDON (§3.8, §8) — abandonAfterDisconnect(); grace
 *     qiymatlari §3.8 jadvalidan (game-timers.DISCONNECT_GRACE_MS).
 *   - clock_update TICK (§3.7) — liveClockPayload(); 5s oralig'ida
 *     (past-vaqt 1s rejimi — keyingi bosqich).
 *   Multi-instance halolligi game-timers.ts sarlavhasida — §10.3 affinity
 *   hali bajarilmagan, taymer o'lgan instance bilan ketsa reaktiv yo'l
 *   qoladi.
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
    private readonly events: EventEmitter2,
    private readonly metrics: MetricsService,
  ) {}

  // --- Kuzatuvchanlik (docs/15-observability.md §3.3 O'YIN) ---------------------

  /**
   * `farzin_active_games{type="online"}` — HPA va turnir kuni
   * dashboard'i manbai (docs/11 §4.4, docs/15 §5.3).
   *
   * Gauge davriy so'rov bilan yangilanadi, hodisa bilan emas: hodisaga
   * asoslangan hisoblagich bitta o'tkazib yuborilgan `finish` dan keyin
   * abadiy noto'g'ri qoladi va uni hech kim sezmaydi.
   *
   * `type="tournament"` va `type="broadcast"` ATAYLAB YOZILMAYDI: OTB
   * turnir taxtasi "jonli o'yin" sifatida modellashtirilmagan (Pairing
   * natijasi kiritilmaganligi — o'ynayotganini bildirmaydi), broadcast
   * moduli esa hali yo'q (docs/14 Faza 8). Bo'sh qator — nol yozishdan
   * halolroq.
   */
  @Interval(30_000)
  async refreshActiveGamesMetric(): Promise<void> {
    try {
      this.metrics.setActiveGames(await this.repo.countActiveGames(), { type: 'online' });
    } catch (err) {
      this.logger.warn(`Faol o'yinlar metrikasi yangilanmadi: ${String(err)}`);
    }
  }

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
    // Do'stona o'yin reytingga kirmasa ham kategoriya to'g'ri bo'lsin:
    // o'yin yozuvi shu qiymat bilan saqlanadi va keyinchalik hisobot,
    // filtr va (reytingli o'yinlar yoqilganda) hovuz tanlash unga
    // tayanadi (K-19).
    assertTimeCategoryMatches(input);

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

    const drawOfferFrom = game.status === 'ACTIVE' ? await this.clocks.getDrawOffer(gameId) : null;

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

  /** Gateway diskonnekt kuzatuvi uchun: faol bo'lsagina qator, aks holda null. */
  async activeGameRow(gameId: string): Promise<GameRow | null> {
    const game = await this.repo.findGame(gameId);
    return game?.status === 'ACTIVE' ? game : null;
  }

  // --- Yurish ---------------------------------------------------------------------

  async makeMove(userId: string, gameId: string, uci: string): Promise<MoveResult> {
    // 1. Vaqtni ENG BIRINCHI o'lchaymiz (docs/07 §5.2 1-qadam).
    const now = Date.now();
    // Kuzatuvchanlik: SLO #2 manbai (docs/15 §6.2 — p95 < 150 ms).
    // Monotonik soat: NTP sakrashi o'lchovni buzmasin.
    const processingStartedAt = process.hrtime.bigint();

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
      const state =
        entry?.state ?? this.reconstructClock(game, await this.repo.listMoves(gameId), now);
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
      this.emitFinished(game, endStatus);
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

    // ⏱️  FAQAT QABUL QILINGAN yurish o'lchanadi: SLI "yurish qayta
    // ishlash" haqida, rad etilgan niyat (noqonuniy yurish, navbat emas)
    // haqida emas — ular boshqa taqsimot va SLO'ni buzib ko'rsatardi.
    // Broadcast gateway'da, service transportni bilmaydi — shuning uchun
    // o'lchov "service pipeline'i tugadi" nuqtasida to'xtaydi (§3.3
    // ta'rifidan hujjatlangan chetlanish).
    this.metrics.observeMoveProcessing(
      Number(process.hrtime.bigint() - processingStartedAt) / 1e9,
      { gameType: game.timeCategory },
    );

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
    return this.requireFinished(await this.finishNoMove(game, 'RESIGNATION', winner, userId));
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
      throw new BusinessRuleError('NO_DRAW_OFFER', "Qabul qilinadigan durang taklifi yo'q");
    }
    return this.requireFinished(await this.finishNoMove(game, 'DRAW_AGREED', null, userId));
  }

  /**
   * Abort — 2-yurishgacha (docs/07 §4: active → aborted "faqat
   * 1-yurishgacha"; §3.8 abort oynasi). Reytingga ta'sir qilmaydi.
   */
  async abort(userId: string, gameId: string): Promise<GameEndedPayload> {
    const { game } = await this.requireActivePlayer(userId, gameId);
    if (game.plyCount >= 2) {
      throw new BusinessRuleError(
        'ABORT_WINDOW_CLOSED',
        'Abort oynasi yopilgan (2-yurishdan keyin)',
      );
    }
    return this.requireFinished(await this.finishNoMove(game, 'ABORTED', null, userId));
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

  // --- Proaktiv flag / grace / tick (docs/07 §3.5, §3.7, §3.8) ----------------------

  /**
   * PROAKTIV flag tekshiruvi (docs/07 §3.5 2-yo'l): gateway'dagi taymer
   * uyg'onganda chaqiriladi. Haqiqat manbai — Redis soati "hozir" kesimida
   * (taymer kechikkan/erta uyg'ongan bo'lishi mumkin — event loop band,
   * yoki oraliqda yurish kelgan). Vaqt hali bor bo'lsa 'wait' qaytadi va
   * chaqiruvchi qayta rejalashtiradi; flag tasdiqlansa o'yin TIMEOUT bilan
   * tugaydi (FIDE 6.9 tekshiruvi finishByTimeout ichida — claim yo'li bilan
   * BIR XIL mantiq, actor=null: bu server qarori).
   *
   * @param expectedWakeAtMs Taymer AYNAN qachon uyg'onishi rejalashtirilgan
   *   edi (gateway `armClockTimers` da hisoblaydi). Berilsa —
   *   `farzin_clock_drift_seconds` yoziladi.
   *
   *   NIMA O'LCHANADI (halol ta'rif): serverning REJALASHTIRGAN vaqti
   *   bilan HAQIQATDA uyg'ongan vaqti orasidagi farq — ya'ni event loop
   *   kechikishi. docs/15 §3.3 buni "server hisobi vs kutilgan" deb
   *   ta'riflaydi va uni ADOLAT metrikasi deb ataydi: drift o'sganda flag
   *   kech aniqlanadi va vaqti tugagan o'yinchi qo'shimcha o'ylash vaqti
   *   oladi.
   *
   *   NIMA O'LCHANMAYDI: o'yinchining qurilma soati bilan server soati
   *   orasidagi farq. Buning uchun klient timestamp'i kerak, u esa
   *   ishonchsiz va hozircha protokolimizda yo'q (docs/07 §3.3 monotonik
   *   hot-path bosqichi). Soxta manba qo'shishdan ko'ra o'lchanadigan
   *   haqiqiy signal afzal.
   */
  async checkFlag(gameId: string, expectedWakeAtMs?: number): Promise<FlagCheckResult> {
    const now = Date.now();
    const game = await this.repo.findGame(gameId);
    if (game?.status !== 'ACTIVE' || game.plyCount === 0) {
      // Tugagan yoki soat hali yurmagan (oqning 1-yurishi bepul, §3.8).
      return { kind: 'stop' };
    }
    if (expectedWakeAtMs !== undefined) {
      this.metrics.observeClockDrift(Math.abs(now - expectedWakeAtMs) / 1000, {
        gameType: game.timeCategory,
      });
    }
    const config = clockConfig(game);
    const entry = await this.clocks.load(gameId);
    const state =
      entry?.state ?? this.reconstructClock(game, await this.repo.listMoves(gameId), now);
    const mover = state.turn;
    const rem = remaining(config, state, mover, now);
    if (rem > 0) {
      return { kind: 'wait', remainingMs: rem };
    }

    const flaggedState: ClockState = {
      whiteRemainingMs: mover === 'w' ? 0 : remaining(config, state, 'w', now),
      blackRemainingMs: mover === 'b' ? 0 : remaining(config, state, 'b', now),
      turn: state.turn,
      lastEventAtMs: state.lastEventAtMs,
    };
    const ended = await this.finishByTimeout(game, mover, flaggedState, null);
    // ended === null → parallel yo'l (yurish/claim/resign) allaqachon
    // tugatgan — idempotentlik, broadcast o'sha yo'ldan ketgan.
    return ended === null ? { kind: 'stop' } : { kind: 'ended', ended };
  }

  /**
   * Diskonnekt grace tugadi (docs/07 §3.8, §8) — o'yin ABANDONED.
   *
   * WINNER SEMANTIKASI (schema: winnerColor null = durang):
   *  - raqib hali ulangan → g'olib RAQIB (uzilgan o'yinchi yutqazadi);
   *  - IKKALASI ham yo'q → winnerColor=null, ya'ni durang (docs/07 §4:
   *    "ikkalasi ham yo'qolgan bo'lsa natija draw ... hal qilinadi").
   *
   * DEVIATSIYA (hujjatlangan): §3.8 jadvalida grace'dan keyin ulangan
   * o'yinchiga "claim victory" TUGMASI faollashadi; birinchi bo'lakda server
   * grace tugashi bilan O'ZI tugatadi — abandoned o'yin stolda qolib
   * ketmasligi soddaroq va abuse'ga chidamli (claim tugmasi UX'i keyin).
   *
   * Idempotent: o'yin allaqachon tugagan bo'lsa null (broadcast yo'q).
   */
  async abandonAfterDisconnect(
    gameId: string,
    goneSide: ClockSide,
    opponentConnected: boolean,
  ): Promise<GameEndedPayload | null> {
    const game = await this.repo.findGame(gameId);
    if (game?.status !== 'ACTIVE') {
      return null;
    }
    const winnerColor: ColorValue | null = opponentConnected
      ? goneSide === 'w'
        ? 'BLACK'
        : 'WHITE'
      : null;
    return await this.finishNoMove(game, 'ABANDONED', winnerColor, null);
  }

  /**
   * docs/07 §3.7 sinxron tick uchun jonli soat. ACTIVE bo'lmasa null —
   * chaqiruvchi tick'ni to'xtatadi. Yengil yo'l: 1 DB o'qish + 1 Redis
   * o'qish (Move logi faqat Redis yozuvi yo'qolganda o'qiladi).
   */
  async liveClockPayload(gameId: string): Promise<ClockPayload | null> {
    const now = Date.now();
    const game = await this.repo.findGame(gameId);
    if (game?.status !== 'ACTIVE') {
      return null;
    }
    const config = clockConfig(game);
    if (game.plyCount === 0) {
      return { whiteMs: config.baseMs, blackMs: config.baseMs, running: null, serverSentAtMs: now };
    }
    const entry = await this.clocks.load(gameId);
    const state =
      entry?.state ?? this.reconstructClock(game, await this.repo.listMoves(gameId), now);
    return {
      whiteMs: remaining(config, state, 'w', now),
      blackMs: remaining(config, state, 'b', now),
      running: state.turn,
      serverSentAtMs: now,
    };
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
    /** null = server qarori (proaktiv taymer, docs/07 §3.5 2-yo'l). */
    actorUserId: string | null,
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
    this.emitFinished(game, status);
    return {
      gameId: game.id,
      status,
      winnerColor,
      finalFen: game.fen,
      clock: toClockPayload(finalClock, true, Date.now()),
    };
  }

  /**
   * Yurishsiz tugatish (resign / draw / abort / abandon). Idempotent:
   * o'yin allaqachon terminal bo'lsa null qaytadi — foydalanuvchi amali
   * bo'lsa chaqiruvchi requireFinished bilan 422 ga aylantiradi, server
   * taymeri bo'lsa (abandon) jimgina o'tkazib yuboradi.
   */
  private async finishNoMove(
    game: GameRow,
    status: OnlineGameStatusValue,
    winnerColor: ColorValue | null,
    actorUserId: string | null,
  ): Promise<GameEndedPayload | null> {
    const now = Date.now();
    const moves = await this.repo.listMoves(game.id);
    const config = clockConfig(game);
    const entry = await this.clocks.load(game.id);
    const state = entry?.state ?? this.reconstructClock(game, moves, now);

    // Yakuniy soat: yuruvchi tomonning jonli qiymati "hozir" kesimida.
    const finalState: ClockState = {
      whiteRemainingMs: game.plyCount === 0 ? config.baseMs : remaining(config, state, 'w', now),
      blackRemainingMs: game.plyCount === 0 ? config.baseMs : remaining(config, state, 'b', now),
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
      return null;
    }
    await this.clocks.clear(game.id);
    this.emitFinished(game, status);
    return {
      gameId: game.id,
      status,
      winnerColor,
      finalFen: game.fen,
      clock: toClockPayload(finalState, true, now),
    };
  }

  /**
   * O'yin tugadi — modullararo xabar (fairplay tanlab tahlil, docs/08
   * §8.2). EventEmitter2 — ADR-0008: tahlil yo'qolishi katastrofik emas,
   * shuning uchun outbox SHART EMAS (hujjatlangan tanlov, play.types).
   */
  private emitFinished(game: GameRow, status: OnlineGameStatusValue): void {
    const event: PlayGameFinishedEvent = {
      gameId: game.id,
      whitePlayerId: game.whitePlayerId,
      blackPlayerId: game.blackPlayerId,
      isRated: game.isRated,
      timeCategory: game.timeCategory,
      status,
    };
    this.events.emit(PLAY_GAME_FINISHED_EVENT, event);
  }

  /** Foydalanuvchi amali uchun: idempotentlik null'i → GAME_NOT_ACTIVE (422). */
  private requireFinished(ended: GameEndedPayload | null): GameEndedPayload {
    if (ended === null) {
      throw new BusinessRuleError('GAME_NOT_ACTIVE', "O'yin allaqachon tugagan");
    }
    return ended;
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
