import { Logger } from '@nestjs/common';
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

import { DomainError, NotFoundError } from '../../core/errors/domain.error';
import { PlayService } from './play.service';
import {
  PLAY_MATCHED_EVENT,
  WS_EVENTS,
  type Ack,
  type ClaimTimeoutAckData,
  type GameErrorCode,
  type GameErrorPayload,
  type GameStatePayload,
  type MoveAckData,
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
 *  room'iga yuboriladi (taklif maxfiy ma'lumot emas).
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

  constructor(
    private readonly play: PlayService,
    private readonly jwt: JwtService,
  ) {}

  // --- Ulanish -------------------------------------------------------------------

  async handleConnection(socket: Socket): Promise<void> {
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

  handleDisconnect(socket: Socket): void {
    this.moveWindows.delete(socket.id);
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
      return ackError('token_expired', 'Autentifikatsiya yo\'q');
    }
    const gameId = gameRef(payload);
    if (gameId === null) {
      return ackError('internal', 'gameId kerak');
    }
    try {
      const state = await this.play.getGameView(gameId, userId);
      await socket.join(roomOf(gameId));
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
      return ackError('token_expired', 'Autentifikatsiya yo\'q');
    }
    if (!this.allowMove(socket.id)) {
      return ackError('rate_limited', "Juda tez — 10 yurish/s chegarasi");
    }
    const intent = moveIntent(payload);
    if (intent === null) {
      return ackError('illegal_move', 'Yurish payload\'i buzuq');
    }

    const result = await this.play.makeMove(userId, intent.gameId, intent.uci);
    if (!result.ok) {
      if (result.ended !== undefined) {
        // Flag aniqlanib o'yin TIMEOUT bilan tugadi — hammaga e'lon.
        this.server.to(roomOf(intent.gameId)).emit(WS_EVENTS.ended, result.ended);
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
      this.server.to(roomOf(intent.gameId)).emit(WS_EVENTS.ended, result.ended);
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
      this.server.to(roomOf(gameId)).emit(WS_EVENTS.ended, ended);
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
      this.server.to(roomOf(gameId)).emit(WS_EVENTS.ended, ended);
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
      this.server.to(roomOf(gameId)).emit(WS_EVENTS.ended, ended);
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
      return ackError('token_expired', 'Autentifikatsiya yo\'q');
    }
    const gameId = gameRef(payload);
    if (gameId === null) {
      return ackError('internal', 'gameId kerak');
    }
    try {
      const result = await this.play.claimTimeout(userId, gameId);
      if (result.ended !== undefined) {
        this.server.to(roomOf(gameId)).emit(WS_EVENTS.ended, result.ended);
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
      return ackError('token_expired', 'Autentifikatsiya yo\'q');
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
