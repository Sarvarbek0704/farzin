import { Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { OnEvent } from '@nestjs/event-emitter';
import { JwtService } from '@nestjs/jwt';
import {
  OnGatewayConnection,
  OnGatewayDisconnect,
  SubscribeMessage,
  WebSocketGateway,
  WebSocketServer,
  ConnectedSocket,
  MessageBody,
} from '@nestjs/websockets';
import type { Server, Socket } from 'socket.io';

import type { ClockSide } from '../../core/clock/chess-clock';
import { DomainError, NotFoundError } from '../../core/errors/domain.error';
import type { AppConfig } from '../../config/configuration';
import { MetricsService } from '../../shared/metrics/metrics.service';
import { ClockStore } from './clock.store';
import {
  CLOCK_TICK_INTERVAL_MS,
  FLAG_EPSILON_MS,
  flagDelayMs,
  GameTimers,
  graceMsFor,
} from './game-timers';
import { PlayService } from './play.service';
import {
  PLAY_MATCHED_EVENT,
  WS_EVENTS,
  type Ack,
  type ClaimTimeoutAckData,
  type ClockPayload,
  type ClockUpdatePayload,
  type GameEndedPayload,
  type GameErrorCode,
  type GameErrorPayload,
  type GameStatePayload,
  type MoveAckData,
  type OpponentBackPayload,
  type OpponentGonePayload,
  type PlayMatchedEvent,
} from './play.types';

/**
 * Play gateway — Socket.IO `/play` namespace (docs/07-realtime-and-clock.md §7).
 *
 * ═══════════════════════════════════════════════════════════════════════════
 *  TRANSPORT: faqat WebSocket (`transports: ['websocket']`) — sticky-session
 *  muammosining yechimi (docs/07 §10.2 muqobili, docs/14 Faza 5 "WebSocket-only
 *  transport"). Polling fallback ATAYLAB o'chirilgan: long-polling handshake
 *  turli node'ga tushsa "Session ID unknown" beradi; websocket-only'da sticky
 *  shart emas. Narxi: ba'zi korporativ proxy'lar ortida ulanish yo'qoladi —
 *  ongli trade-off.
 *
 *  AUTH: handshake'da JWT (`auth.token`, docs/07 §7.1). IdentityModule
 *  JwtModule'ni EKSPORT QILMAYDI — shu sababli play.module o'z JwtModule'ini
 *  AYNI konfiguratsiya bilan (ConfigService orqali) ro'yxatga oladi va bu
 *  yerda faqat verify ishlatiladi. Yaroqsiz token → `game:error
 *  {code:'token_expired'}` + disconnect (docs/07 §7.1 connect_error
 *  semantikasining soddalashtirilgan varianti — middleware bosqichi keyin).
 *
 *  SERVER-AUTHORITATIVE (docs/07 §2): client faqat NIYAT yuboradi; taxta,
 *  soat, natija — barchasi service'da hisoblanadi. `game:ended` FAQAT
 *  server→client. Rooms: `game:{id}` (o'yinchi + tomoshabin),
 *  `user:{userId}` (shaxsiy xabar — matchmaking topildi).
 *
 *  RATE LIMIT (docs/10-security.md §7.1: WS move 10/s): socket boshiga
 *  yengil fixed-window hisoblagich — chess.js validatsiyasini spam'dan
 *  himoya qiladi.
 *
 *  DEVIATSIYA (hujjatlangan): `game:draw_offered` §7.3 bo'yicha faqat
 *  `:players` room'iga ketishi kerak; birinchi bo'lakda butun o'yin
 *  room'iga yuboriladi (taklif maxfiy ma'lumot emas). Xuddi shu sabab
 *  bilan `opponent_gone`/`opponent_back` ham butun room'ga ketadi
 *  (tomoshabin ham "o'yinchi uzildi" indikatorini ko'radi).
 *
 *  HAYOT SIKLI TAYMERLARI (game-timers.ts registri):
 *   - FLAG (docs/07 §3.5 proaktiv yo'l): har muvaffaqiyatli yurishdan keyin
 *     yurayotgan tomonning qolgan vaqti + epsilon'ga setTimeout qo'yiladi.
 *     Uyg'onganda service.checkFlag Redis soatini (avtoritativ) qayta
 *     o'qiydi: vaqt bor → qayta rejalashtirish, flag → TIMEOUT (FIDE 6.9
 *     claim yo'li bilan BIR XIL mantiq) + game:ended broadcast.
 *   - clock_update TICK (§3.7): o'yin faolligida har 5s avtoritativ soat
 *     room'ga yuboriladi — client displey drift'ini tuzatadi. Past-vaqt
 *     (<30s) 1s chastota rejimi — keyingi bosqich (hujjatlangan qoldiq).
 *   - DISKONNEKT GRACE (§3.8, §8): o'yinchining OXIRGI socket'i uzilganda
 *     kategoriya bo'yicha grace (game-timers.DISCONNECT_GRACE_MS, env
 *     override PLAY_DISCONNECT_GRACE_MS) boshlanadi, room'ga
 *     `opponent_gone {graceMs}` ketadi. Grace ichida game:join → grace
 *     bekor + `opponent_back` + ack'da TO'LIQ game:state snapshot (§8.1 —
 *     RECONNECT SHARTNOMASI: client har doim game:join dan resync oladi).
 *     Grace tugasa va o'yinchi hali yo'q → ABANDONED (service hujjati).
 *     DIQQAT: diskonnekt SOATNI TO'XTATMAYDI (§3.8 qattiq qoida).
 *   - Presence: Redis `game:presence:{gameId}:{color}` markerlari
 *     (clock.store.ts) — multi-instance uchun arzon signal; grace qarori
 *     hozircha shu instance'ning in-memory registriga tayanadi
 *     (bitta-instance cheklovi clock.store.ts da halol hujjatlangan).
 *   Barcha taymerlar o'yin tugashida clearGame, modul yopilishida
 *   GameTimers.onModuleDestroy bilan bekor qilinadi (open-handle yo'q).
 * ═══════════════════════════════════════════════════════════════════════════
 */

interface AccessPayload {
  sub: string;
  sid: string;
}

/** 10 yurish / soniya / socket (docs/10 §7.1). */
const MOVE_RATE_LIMIT = 10;
const MOVE_RATE_WINDOW_MS = 1_000;

@WebSocketGateway({
  namespace: '/play',
  transports: ['websocket'],
  cors: { origin: true, credentials: true },
})
export class PlayGateway implements OnGatewayConnection, OnGatewayDisconnect {
  private readonly logger = new Logger(PlayGateway.name);

  @WebSocketServer()
  private readonly server!: Server;

  private readonly moveWindows = new Map<string, { start: number; count: number }>();

  /** socketId → (gameId → rang): bu socket qaysi o'yinlarda O'YINCHI. */
  private readonly playerGamesBySocket = new Map<string, Map<string, ClockSide>>();

  /** gameId → rang → jonli o'yinchi socketlari (bir o'yinchi = bir nechta tab). */
  private readonly playerSocketsByGame = new Map<string, Record<ClockSide, Set<string>>>();

  /** PLAY_DISCONNECT_GRACE_MS override (test/ops); null → docs/07 §3.8 jadvali. */
  private readonly graceOverrideMs: number | null;

  /**
   * `farzin_websocket_connections{namespace="play"}` manbai
   * (docs/15-observability.md §3.3; HPA — docs/11 §4.4).
   *
   * HALOL CHEKLOV: bu SHU instance'dagi socket soni. Ko'p instance'da
   * Prometheus ularni `sum()` bilan qo'shadi — aynan HPA'ga kerak
   * ko'rinish. Redis'dagi global hisoblagich ATAYLAB olinmadi: u yangi
   * nomuvofiqlik manbai bo'lardi (crash → oqib qolgan hisob).
   */
  private wsConnections = 0;

  constructor(
    private readonly play: PlayService,
    private readonly jwt: JwtService,
    private readonly clocks: ClockStore,
    private readonly timers: GameTimers,
    private readonly metrics: MetricsService,
    config: ConfigService<AppConfig, true>,
  ) {
    this.graceOverrideMs = config.get('play', { infer: true }).disconnectGraceMsOverride;
  }

  // --- Ulanish -------------------------------------------------------------------

  async handleConnection(socket: Socket): Promise<void> {
    // Metrika: ulanish RESURSNI band qiladi — autentifikatsiya natijasidan
    // qat'i nazar sanaladi. `counted` bayrog'i ikki marta ayirishni
    // to'sadi (rad etilgan ulanish ham disconnect hodisasini beradi).
    (socket.data as Record<string, unknown>).counted = true;
    this.trackWsConnections(1);

    const auth = socket.handshake.auth as Record<string, unknown>;
    const token = typeof auth.token === 'string' ? auth.token : null;
    if (token === null) {
      this.rejectConnection(socket, 'token_expired', 'Token berilmadi');
      return;
    }
    try {
      const payload = await this.jwt.verifyAsync<AccessPayload>(token);
      (socket.data as Record<string, unknown>).userId = payload.sub;
      await socket.join(`user:${payload.sub}`);
    } catch {
      this.rejectConnection(socket, 'token_expired', 'Token yaroqsiz yoki muddati tugagan');
    }
  }

  /**
   * Diskonnekt (docs/07 §3.8): soat TO'XTAMAYDI. O'yinchining oxirgi
   * socket'i ketganda presence o'chadi, grace boshlanadi va room'ga
   * `opponent_gone` yuboriladi.
   */
  handleDisconnect(socket: Socket): void {
    const data = socket.data as Record<string, unknown>;
    if (data.counted === true) {
      data.counted = false;
      this.trackWsConnections(-1);
    }
    this.moveWindows.delete(socket.id);
    const games = this.playerGamesBySocket.get(socket.id);
    this.playerGamesBySocket.delete(socket.id);
    if (games === undefined) {
      return;
    }
    for (const [gameId, side] of games) {
      void this.onPlayerSocketGone(socket.id, gameId, side).catch(
        this.swallow(`diskonnekt kuzatuvi: game=${gameId}`),
      );
    }
  }

  /**
   * WS ulanishlari gauge'ini ±1 ga SURIB yangilaydi (docs/15 §3.3).
   *
   * Nega hisob shu yerda qo'lda yuritiladi: `server.engine.clientsCount`
   * faqat qo'l siqish TUGAGANDAN keyin aniq bo'ladi va rad etilgan
   * socket'ni o'z vaqtida ayirmaydi. `counted` bayrog'i bilan juftlangan
   * ±1 esa har bir socket AYNAN bir marta sanalishini kafolatlaydi.
   *
   * `Math.max(0, …)` — himoya: hodisalar tartibi buzilsa ham gauge
   * manfiyga tushmaydi (manfiy qiymat HPA hisobini buzardi).
   */
  private trackWsConnections(delta: number): void {
    this.wsConnections = Math.max(0, this.wsConnections + delta);
    this.metrics.setWebsocketConnections(this.wsConnections, { namespace: 'play' });
  }

  private rejectConnection(socket: Socket, code: GameErrorCode, message: string): void {
    socket.emit(WS_EVENTS.error, { code, message } satisfies GameErrorPayload);
    socket.disconnect(true);
  }

  private userIdOf(socket: Socket): string | null {
    const userId = (socket.data as Record<string, unknown>).userId;
    return typeof userId === 'string' ? userId : null;
  }

  // --- Event handler'lar (nomlar — docs/07 §7.2 kontraktidan) -----------------------

  /** Room'ga qo'shilish + TO'LIQ snapshot (docs/07 §8.1: event resend YO'Q). */
  @SubscribeMessage(WS_EVENTS.join)
  async onJoin(
    @ConnectedSocket() socket: Socket,
    @MessageBody() payload: unknown,
  ): Promise<Ack<GameStatePayload>> {
    const userId = this.userIdOf(socket);
    if (userId === null) {
      return ackError('token_expired', "Autentifikatsiya yo'q");
    }
    const gameId = gameRef(payload);
    if (gameId === null) {
      return ackError('internal', 'gameId kerak');
    }
    try {
      // RECONNECT SHARTNOMASI (docs/07 §8.1): ack HAR DOIM to'liq snapshot —
      // fen, barcha yurishlar, jonli soat (Redis'dan "hozir" kesimida),
      // status, drawOfferFrom. Client taxtani shu javobdan noldan quradi.
      const state = await this.play.getGameView(gameId, userId);
      await socket.join(roomOf(gameId));
      if (state.status === 'ACTIVE' && state.viewerRole !== 'spectator') {
        await this.registerPlayerSocket(socket, gameId, state.viewerRole === 'white' ? 'w' : 'b');
      }
      return { ok: true, data: state };
    } catch (e) {
      return this.toAckError(e);
    }
  }

  /** Yurish NIYATI — {gameId, from, to, promotion?} (docs/07 §2.1, §7.2). */
  @SubscribeMessage(WS_EVENTS.move)
  async onMove(
    @ConnectedSocket() socket: Socket,
    @MessageBody() payload: unknown,
  ): Promise<Ack<MoveAckData>> {
    const userId = this.userIdOf(socket);
    if (userId === null) {
      return ackError('token_expired', "Autentifikatsiya yo'q");
    }
    if (!this.allowMove(socket.id)) {
      return ackError('rate_limited', 'Juda tez — 10 yurish/s chegarasi');
    }
    const intent = moveIntent(payload);
    if (intent === null) {
      return ackError('illegal_move', "Yurish payload'i buzuq");
    }

    const result = await this.play.makeMove(userId, intent.gameId, intent.uci);
    if (!result.ok) {
      if (result.ended !== undefined) {
        // Flag aniqlanib o'yin TIMEOUT bilan tugadi — hammaga e'lon.
        this.announceEnd(intent.gameId, result.ended);
      }
      return {
        ok: false,
        error: {
          code: result.code,
          message: result.message,
          ...(result.resyncFen !== undefined && { resyncFen: result.resyncFen }),
        },
      };
    }

    // Broadcast — yurish avval, o'yin oxiri keyin (tartib muhim).
    this.server.to(roomOf(intent.gameId)).emit(WS_EVENTS.moveMade, result.move);
    if (result.ended !== null) {
      this.announceEnd(intent.gameId, result.ended);
    } else {
      // Navbat raqibga o'tdi — flag taymeri QAYTA qo'yiladi (docs/07 §3.5)
      // va sinxron tick ishlayotganiga ishonch hosil qilinadi (§3.7).
      this.armClockTimers(intent.gameId, result.move.clock);
    }
    return { ok: true, data: { ply: result.move.ply, clock: result.move.clock } };
  }

  @SubscribeMessage(WS_EVENTS.resign)
  async onResign(
    @ConnectedSocket() socket: Socket,
    @MessageBody() payload: unknown,
  ): Promise<Ack<null>> {
    return await this.simpleGameAction(socket, payload, async (userId, gameId) => {
      const ended = await this.play.resign(userId, gameId);
      this.announceEnd(gameId, ended);
    });
  }

  @SubscribeMessage(WS_EVENTS.drawOffer)
  async onDrawOffer(
    @ConnectedSocket() socket: Socket,
    @MessageBody() payload: unknown,
  ): Promise<Ack<null>> {
    return await this.simpleGameAction(socket, payload, async (userId, gameId) => {
      const { from } = await this.play.offerDraw(userId, gameId);
      this.server.to(roomOf(gameId)).emit(WS_EVENTS.drawOffered, { gameId, from });
    });
  }

  @SubscribeMessage(WS_EVENTS.drawAccept)
  async onDrawAccept(
    @ConnectedSocket() socket: Socket,
    @MessageBody() payload: unknown,
  ): Promise<Ack<null>> {
    return await this.simpleGameAction(socket, payload, async (userId, gameId) => {
      const ended = await this.play.acceptDraw(userId, gameId);
      this.announceEnd(gameId, ended);
    });
  }

  /** Abort — 2-yurishgacha (docs/07 §4). */
  @SubscribeMessage(WS_EVENTS.abort)
  async onAbort(
    @ConnectedSocket() socket: Socket,
    @MessageBody() payload: unknown,
  ): Promise<Ack<null>> {
    return await this.simpleGameAction(socket, payload, async (userId, gameId) => {
      const ended = await this.play.abort(userId, gameId);
      this.announceEnd(gameId, ended);
    });
  }

  /** "Raqib vaqti tugadi" — DA'VO, server tekshiradi (docs/07 §3.5). */
  @SubscribeMessage(WS_EVENTS.claimTimeout)
  async onClaimTimeout(
    @ConnectedSocket() socket: Socket,
    @MessageBody() payload: unknown,
  ): Promise<Ack<ClaimTimeoutAckData>> {
    const userId = this.userIdOf(socket);
    if (userId === null) {
      return ackError('token_expired', "Autentifikatsiya yo'q");
    }
    const gameId = gameRef(payload);
    if (gameId === null) {
      return ackError('internal', 'gameId kerak');
    }
    try {
      const result = await this.play.claimTimeout(userId, gameId);
      if (result.ended !== undefined) {
        this.announceEnd(gameId, result.ended);
      }
      return {
        ok: true,
        data: {
          accepted: result.accepted,
          ...(result.remainingMs !== undefined && { remainingMs: result.remainingMs }),
        },
      };
    } catch (e) {
      return this.toAckError(e);
    }
  }

  // --- Matchmaking xabari (EventEmitter2 — service transportni bilmaydi) ------------

  @OnEvent(PLAY_MATCHED_EVENT)
  notifyMatched(event: PlayMatchedEvent): void {
    this.server
      .to(`user:${event.whiteUserId}`)
      .to(`user:${event.blackUserId}`)
      .emit(WS_EVENTS.matched, { gameId: event.gameId });
  }

  // --- Yordamchilar -----------------------------------------------------------------

  private async simpleGameAction(
    socket: Socket,
    payload: unknown,
    action: (userId: string, gameId: string) => Promise<void>,
  ): Promise<Ack<null>> {
    const userId = this.userIdOf(socket);
    if (userId === null) {
      return ackError('token_expired', "Autentifikatsiya yo'q");
    }
    const gameId = gameRef(payload);
    if (gameId === null) {
      return ackError('internal', 'gameId kerak');
    }
    try {
      await action(userId, gameId);
      return { ok: true, data: null };
    } catch (e) {
      return this.toAckError(e);
    }
  }

  // --- Hayot sikli taymerlari (flag / tick / grace) ---------------------------------

  /**
   * O'yin oxiri — YAGONA chiqish nuqtasi: broadcast + barcha taymerlarni
   * tozalash + o'yinchi registrini bo'shatish. Redis kalitlari (soat,
   * durang, presence) service'ning finish yo'lida clocks.clear bilan ketgan.
   */
  private announceEnd(gameId: string, ended: GameEndedPayload): void {
    this.server.to(roomOf(gameId)).emit(WS_EVENTS.ended, ended);
    this.timers.clearGame(gameId);
    const sides = this.playerSocketsByGame.get(gameId);
    if (sides !== undefined) {
      for (const socketId of [...sides.w, ...sides.b]) {
        this.playerGamesBySocket.get(socketId)?.delete(gameId);
      }
      this.playerSocketsByGame.delete(gameId);
    }
  }

  /** Yurishdan keyin: flag taymeri (qolgan vaqt + ε) va tick (idempotent). */
  private armClockTimers(gameId: string, clock: ClockPayload): void {
    const delay = flagDelayMs(clock);
    if (delay !== null) {
      this.timers.scheduleFlag(gameId, delay, () => {
        void this.onFlagTimer(gameId).catch(this.swallow(`flag taymeri: game=${gameId}`));
      });
    }
    this.timers.startTick(gameId, CLOCK_TICK_INTERVAL_MS, () => {
      void this.onClockTick(gameId).catch(this.swallow(`clock tick: game=${gameId}`));
    });
  }

  /** Flag taymeri uyg'ondi — haqiqatni service (Redis soati) hal qiladi. */
  private async onFlagTimer(gameId: string): Promise<void> {
    const res = await this.play.checkFlag(gameId);
    if (res.kind === 'ended') {
      this.announceEnd(gameId, res.ended);
      return;
    }
    if (res.kind === 'wait') {
      // Oraliqda yurish kelgan yoki taymer erta uyg'ongan — qayta.
      this.timers.scheduleFlag(gameId, res.remainingMs + FLAG_EPSILON_MS, () => {
        void this.onFlagTimer(gameId).catch(this.swallow(`flag taymeri: game=${gameId}`));
      });
      return;
    }
    // 'stop' — o'yin parallel yo'lda tugagan (broadcast o'sha yo'ldan ketgan).
    this.timers.clearGame(gameId);
  }

  /** docs/07 §3.7 sinxron tick: avtoritativ soat room'ga, ACTIVE emas → to'xta. */
  private async onClockTick(gameId: string): Promise<void> {
    const clock = await this.play.liveClockPayload(gameId);
    if (clock === null) {
      this.timers.stopTick(gameId);
      return;
    }
    this.server
      .to(roomOf(gameId))
      .emit(WS_EVENTS.clockUpdate, { gameId, clock } satisfies ClockUpdatePayload);
  }

  /** game:join da o'yinchi socket'ini ro'yxatga olish + reconnect aniqlash. */
  private async registerPlayerSocket(
    socket: Socket,
    gameId: string,
    side: ClockSide,
  ): Promise<void> {
    let sides = this.playerSocketsByGame.get(gameId);
    if (sides === undefined) {
      sides = { w: new Set<string>(), b: new Set<string>() };
      this.playerSocketsByGame.set(gameId, sides);
    }
    sides[side].add(socket.id);

    let games = this.playerGamesBySocket.get(socket.id);
    if (games === undefined) {
      games = new Map<string, ClockSide>();
      this.playerGamesBySocket.set(socket.id, games);
    }
    games.set(gameId, side);

    await this.clocks.setPresence(gameId, side);
    if (this.timers.clearGrace(gameId, side)) {
      // Grace ichida qaytdi (docs/07 §8.2) — o'yin davom etadi, soat esa
      // baribir yurgan (§3.8). Room'dagi qolganlarga xabar.
      socket
        .to(roomOf(gameId))
        .emit(WS_EVENTS.opponentBack, { gameId, side } satisfies OpponentBackPayload);
    }
  }

  /** O'yinchi socket'i uzildi — oxirgisi bo'lsa presence o'chadi, grace boshlanadi. */
  private async onPlayerSocketGone(
    socketId: string,
    gameId: string,
    side: ClockSide,
  ): Promise<void> {
    const sides = this.playerSocketsByGame.get(gameId);
    if (sides === undefined) {
      return;
    }
    sides[side].delete(socketId);
    if (sides[side].size > 0) {
      // Boshqa tab hali ulangan — o'yinchi "ketgan" hisoblanmaydi.
      return;
    }
    const game = await this.play.activeGameRow(gameId);
    if (game === null) {
      return; // o'yin allaqachon tugagan — grace shart emas
    }
    await this.clocks.clearPresence(gameId, side);

    const graceMs = graceMsFor(game.timeCategory, this.graceOverrideMs);
    this.server
      .to(roomOf(gameId))
      .emit(WS_EVENTS.opponentGone, { gameId, side, graceMs } satisfies OpponentGonePayload);
    this.timers.scheduleGrace(gameId, side, graceMs, () => {
      void this.onGraceExpired(gameId, side).catch(this.swallow(`grace: game=${gameId}`));
    });
  }

  /** Grace tugadi — o'yinchi hali ham yo'q bo'lsa ABANDONED (service hujjati). */
  private async onGraceExpired(gameId: string, side: ClockSide): Promise<void> {
    const sides = this.playerSocketsByGame.get(gameId);
    if (sides !== undefined && sides[side].size > 0) {
      return; // poyga: reconnect grace bekor qilinishidan oldin yetib kelgan
    }
    const other: ClockSide = side === 'w' ? 'b' : 'w';
    const opponentConnected = sides !== undefined && sides[other].size > 0;
    const ended = await this.play.abandonAfterDisconnect(gameId, side, opponentConnected);
    if (ended !== null) {
      this.announceEnd(gameId, ended);
    }
  }

  private swallow(context: string): (e: unknown) => void {
    return (e: unknown): void => {
      this.logger.error(`${context}: ${String(e)}`);
    };
  }

  private allowMove(socketId: string): boolean {
    const now = Date.now();
    const win = this.moveWindows.get(socketId);
    if (win === undefined || now - win.start >= MOVE_RATE_WINDOW_MS) {
      this.moveWindows.set(socketId, { start: now, count: 1 });
      return true;
    }
    win.count += 1;
    return win.count <= MOVE_RATE_LIMIT;
  }

  /** DomainError → docs/07 §7.3 GameErrorCode. Kutilmagan xato → 'internal'. */
  private toAckError<T>(e: unknown): Ack<T> {
    if (e instanceof NotFoundError) {
      return ackError('game_not_active', e.message);
    }
    if (e instanceof DomainError) {
      const byCode: Record<string, GameErrorCode> = {
        GAME_NOT_ACTIVE: 'game_not_active',
        NO_DRAW_OFFER: 'no_draw_offer',
        ABORT_WINDOW_CLOSED: 'abort_window_closed',
        PLAYER_PROFILE_REQUIRED: 'not_a_player',
      };
      return ackError(byCode[e.code] ?? 'internal', e.message);
    }
    this.logger.error(`WS handler xatosi: ${String(e)}`);
    return ackError('internal', 'Ichki xato');
  }
}

// --- Sof yordamchilar ---------------------------------------------------------------

function roomOf(gameId: string): string {
  return `game:${gameId}`;
}

function ackError<T>(code: GameErrorCode, message: string): Ack<T> {
  return { ok: false, error: { code, message } };
}

function gameRef(payload: unknown): string | null {
  if (typeof payload !== 'object' || payload === null) {
    return null;
  }
  const id = (payload as Record<string, unknown>).gameId;
  return typeof id === 'string' && id.length > 0 ? id : null;
}

/**
 * Yurish niyati — docs/07 §7.2 MovePayload ({from, to, promotion?}).
 * Server UCI'ga yig'adi; qonuniylik baribir core/chess'da tekshiriladi.
 */
function moveIntent(payload: unknown): { gameId: string; uci: string } | null {
  const gameId = gameRef(payload);
  if (gameId === null) {
    return null;
  }
  const p = payload as Record<string, unknown>;
  const square = /^[a-h][1-8]$/;
  const from = typeof p.from === 'string' && square.test(p.from) ? p.from : null;
  const to = typeof p.to === 'string' && square.test(p.to) ? p.to : null;
  if (from === null || to === null) {
    return null;
  }
  const promotion =
    typeof p.promotion === 'string' && /^[qrbn]$/.test(p.promotion) ? p.promotion : '';
  return { gameId, uci: `${from}${to}${promotion}` };
}
