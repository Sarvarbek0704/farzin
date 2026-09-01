import { io, type Socket as ClientSocket } from 'socket.io-client';
import request from 'supertest';

import { bearer, registerUser, resetState, userIdFromToken } from './helpers';
import { createTestApp, type TestApp } from './app.harness';

/**
 * Play moduli integratsiya testi — REST + REAL Socket.IO client
 * (docs/07-realtime-and-clock.md §13.5 E2E qatlami).
 *
 * Oqim: ikki foydalanuvchi ro'yxatdan o'tadi (Player profili avtomatik),
 * do'stona chaqiriq → ACTIVE o'yin → ikkita socket.io-client JWT bilan
 * ulanadi → fool's mate ssenariysi (f3 e5 g4 Qh4#) → server eventlari
 * (`game:move_made`, `game:ended` CHECKMATE + BLACK) → DB'da Move
 * qatorlari (ply, positionHash) va OnlineGame yakuniy holati.
 *
 * Alohida: noqonuniy yurish rad (Move yozilmaydi), tomoshabin yurolmaydi
 * (§14.1), durang taklif/qabul, resign, abort, claim_timeout rad,
 * matchmaking join → darhol juftlik → matchmaking:matched.
 */
describe('play (integration)', () => {
  let t: TestApp;
  let port: number;

  let tokenA = '';
  let tokenB = '';
  let tokenC = '';
  let playerIdB = '';

  let socketA: ClientSocket;
  let socketB: ClientSocket;
  let socketC: ClientSocket;
  const openSockets: ClientSocket[] = [];

  // --- Yordamchilar ---------------------------------------------------------------

  function connectPlay(token: string): Promise<ClientSocket> {
    return new Promise((resolve, reject) => {
      const socket = io(`http://127.0.0.1:${String(port)}/play`, {
        transports: ['websocket'],
        auth: { token },
        forceNew: true,
        reconnection: false,
      });
      openSockets.push(socket);
      const timer = setTimeout(() => {
        reject(new Error('WS ulanish timeout'));
      }, 10_000);
      socket.on('connect', () => {
        clearTimeout(timer);
        resolve(socket);
      });
      socket.on('connect_error', (e) => {
        clearTimeout(timer);
        reject(e);
      });
    });
  }

  /** Tokensiz ulanish — anonim tomoshabin (K-18). */
  function connectAnonymous(): Promise<ClientSocket> {
    return new Promise((resolve, reject) => {
      const socket = io(`http://127.0.0.1:${String(port)}/play`, {
        transports: ['websocket'],
        forceNew: true,
        reconnection: false,
      });
      openSockets.push(socket);
      const timer = setTimeout(() => {
        reject(new Error('WS ulanish timeout'));
      }, 10_000);
      socket.on('connect', () => {
        clearTimeout(timer);
        resolve(socket);
      });
      socket.on('connect_error', (e) => {
        clearTimeout(timer);
        reject(e);
      });
    });
  }

  function emitAck<T>(socket: ClientSocket, event: string, payload: unknown): Promise<T> {
    return new Promise((resolve, reject) => {
      socket.timeout(5_000).emit(event, payload, (err: unknown, res: T) => {
        if (err) {
          reject(new Error(`ack timeout: ${event}`));
        } else {
          resolve(res);
        }
      });
    });
  }

  function waitFor<T>(socket: ClientSocket, event: string, timeoutMs = 5_000): Promise<T> {
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        reject(new Error(`event kutish timeout: ${event}`));
      }, timeoutMs);
      socket.once(event, (payload: T) => {
        clearTimeout(timer);
        resolve(payload);
      });
    });
  }

  async function createChallenge(
    token: string,
    opponentPlayerId: string,
    overrides: Record<string, unknown> = {},
  ): Promise<string> {
    const res = await request(t.server)
      .post('/api/v1/play/challenges')
      .set(bearer(token))
      .send({
        opponentPlayerId,
        timeCategory: 'BLITZ',
        clockType: 'SUDDEN_DEATH',
        baseTimeSeconds: 180,
        incrementSeconds: 0,
        ...overrides,
      });
    expect(res.status).toBe(201);
    return res.body.gameId as string;
  }

  async function playUci(
    mover: ClientSocket,
    watcher: ClientSocket,
    gameId: string,
    from: string,
    to: string,
  ): Promise<{ ack: { ok: boolean }; broadcast: Record<string, unknown> }> {
    const broadcastP = waitFor<Record<string, unknown>>(watcher, 'game:move_made');
    const ack = await emitAck<{ ok: boolean }>(mover, 'game:move', { gameId, from, to });
    const broadcast = await broadcastP;
    return { ack, broadcast };
  }

  // --- Hayot sikli ------------------------------------------------------------------

  beforeAll(async () => {
    t = await createTestApp();
    await resetState(t.prisma, t.redis);

    // WS uchun server REAL portda tinglashi kerak (supertest'ga ta'sir qilmaydi).
    await t.app.listen(0);
    const address = t.server.address();
    if (address === null || typeof address === 'string') {
      throw new Error('server porti aniqlanmadi');
    }
    port = address.port;

    // 3/soat register limiti — aynan 3 foydalanuvchi (A, B, C-tomoshabin).
    const resA = await registerUser(t.server, { email: 'play-white@farzin.uz' });
    const resB = await registerUser(t.server, { email: 'play-black@farzin.uz' });
    const resC = await registerUser(t.server, { email: 'play-watcher@farzin.uz' });
    expect(resA.status).toBe(201);
    expect(resB.status).toBe(201);
    expect(resC.status).toBe(201);
    tokenA = resA.body.accessToken as string;
    tokenB = resB.body.accessToken as string;
    tokenC = resC.body.accessToken as string;

    const userIdB = userIdFromToken(tokenB);
    const playerB = await t.prisma.player.findFirst({ where: { userId: userIdB } });
    if (playerB === null) {
      throw new Error('registratsiya Player profilini yaratmadi');
    }
    playerIdB = playerB.id;

    socketA = await connectPlay(tokenA);
    socketB = await connectPlay(tokenB);
    socketC = await connectPlay(tokenC);
  });

  afterAll(async () => {
    for (const s of openSockets) {
      if (s.connected) {
        s.disconnect();
      }
    }
    await t.close();
  });

  // --- Auth --------------------------------------------------------------------------

  it('yaroqsiz JWT bilan ulanish → game:error + majburiy uzish (docs/07 §7.1)', async () => {
    const socket = io(`http://127.0.0.1:${String(port)}/play`, {
      transports: ['websocket'],
      auth: { token: 'buzuq-token' },
      forceNew: true,
      reconnection: false,
    });
    const errP = new Promise<Record<string, unknown>>((resolve) => {
      socket.once('game:error', (p: Record<string, unknown>) => {
        resolve(p);
      });
    });
    const discP = new Promise<void>((resolve) => {
      socket.once('disconnect', () => {
        resolve();
      });
    });
    const err = await errP;
    await discP;
    expect(err.code).toBe('token_expired');
    socket.close();
  });

  // --- Do'stona chaqiriq + fool's mate ------------------------------------------------

  describe("fool's mate — to'liq WS oqimi", () => {
    let gameId = '';

    it("REST: chaqiriq yaratish → ACTIVE o'yin, chaqiruvchi OQ", async () => {
      const res = await request(t.server).post('/api/v1/play/challenges').set(bearer(tokenA)).send({
        opponentPlayerId: playerIdB,
        timeCategory: 'BLITZ',
        clockType: 'SUDDEN_DEATH',
        baseTimeSeconds: 180,
        incrementSeconds: 0,
      });
      expect(res.status).toBe(201);
      expect(res.body.status).toBe('ACTIVE');
      expect(res.body.viewerRole).toBe('white');
      expect(res.body.isRated).toBe(false);
      expect(res.body.clock.whiteMs).toBe(180_000);
      expect(res.body.clock.running).toBeNull();
      gameId = res.body.gameId as string;

      // Jonli soat yozuvi Redis'da yaratildi (game:clock:{id}).
      expect(await t.redis.get(`game:clock:${gameId}`)).not.toBeNull();
    });

    it("game:join — har ikki o'yinchi TO'LIQ snapshot oladi (§8.1)", async () => {
      const ackA = await emitAck<{ ok: boolean; data: Record<string, unknown> }>(
        socketA,
        'game:join',
        { gameId },
      );
      const ackB = await emitAck<{ ok: boolean; data: Record<string, unknown> }>(
        socketB,
        'game:join',
        { gameId },
      );
      expect(ackA.ok).toBe(true);
      expect(ackA.data.viewerRole).toBe('white');
      expect(ackB.data.viewerRole).toBe('black');
      expect(ackA.data.moves).toEqual([]);
    });

    it('tomoshabin join → spectator, yurishi → not_a_player (§14.1)', async () => {
      const ackJoin = await emitAck<{ ok: boolean; data: Record<string, unknown> }>(
        socketC,
        'game:join',
        { gameId },
      );
      expect(ackJoin.ok).toBe(true);
      expect(ackJoin.data.viewerRole).toBe('spectator');

      const ackMove = await emitAck<{ ok: boolean; error: Record<string, unknown> }>(
        socketC,
        'game:move',
        { gameId, from: 'e2', to: 'e4' },
      );
      expect(ackMove.ok).toBe(false);
      expect(ackMove.error.code).toBe('not_a_player');
    });

    it('noqonuniy yurish → illegal_move + resyncFen, Move qatori YOZILMAYDI', async () => {
      const ack = await emitAck<{ ok: boolean; error: Record<string, unknown> }>(
        socketA,
        'game:move',
        { gameId, from: 'a1', to: 'h8' },
      );
      expect(ack.ok).toBe(false);
      expect(ack.error.code).toBe('illegal_move');
      expect(typeof ack.error.resyncFen).toBe('string');
      expect(await t.prisma.move.count({ where: { gameId } })).toBe(0);
    });

    it('navbat qorada emas: qora birinchi yura olmaydi → not_your_turn', async () => {
      const ack = await emitAck<{ ok: boolean; error: Record<string, unknown> }>(
        socketB,
        'game:move',
        { gameId, from: 'e7', to: 'e5' },
      );
      expect(ack.ok).toBe(false);
      expect(ack.error.code).toBe('not_your_turn');
    });

    it("fool's mate: f3 e5 g4 Qh4# → game:ended CHECKMATE, g'olib QORA", async () => {
      const r1 = await playUci(socketA, socketB, gameId, 'f2', 'f3');
      expect(r1.ack.ok).toBe(true);
      expect(r1.broadcast.san).toBe('f3');
      expect(r1.broadcast.ply).toBe(1);

      const r2 = await playUci(socketB, socketA, gameId, 'e7', 'e5');
      expect(r2.broadcast.san).toBe('e5');

      const r3 = await playUci(socketA, socketB, gameId, 'g2', 'g4');
      expect(r3.broadcast.ply).toBe(3);

      const endedAP = waitFor<Record<string, unknown>>(socketA, 'game:ended');
      const endedBP = waitFor<Record<string, unknown>>(socketB, 'game:ended');
      const r4 = await playUci(socketB, socketA, gameId, 'd8', 'h4');
      expect(r4.ack.ok).toBe(true);
      expect(r4.broadcast.san).toBe('Qh4#');

      const endedA = await endedAP;
      const endedB = await endedBP;
      expect(endedA.status).toBe('CHECKMATE');
      expect(endedA.winnerColor).toBe('BLACK');
      expect(endedB.status).toBe('CHECKMATE');
    });

    it('DB: Move qatorlari (ply, positionHash, soat) va OnlineGame yakuniy holati', async () => {
      const moves = await t.prisma.move.findMany({ where: { gameId }, orderBy: { ply: 'asc' } });
      expect(moves.map((m) => m.ply)).toEqual([1, 2, 3, 4]);
      expect(moves.map((m) => m.san)).toEqual(['f3', 'e5', 'g4', 'Qh4#']);
      for (const m of moves) {
        expect(m.positionHash).toMatch(/^[0-9a-f]{16}$/);
        expect(m.clockAfterMs).not.toBeNull();
        expect(m.clockAfterMs ?? 0).toBeLessThanOrEqual(180_000);
      }
      // Oqning 1-yurishi BEPUL (soat oqning 1-yurishidan keyin boshlanadi).
      expect(moves[0]!.thinkTimeMs).toBeNull();
      expect(moves[1]!.thinkTimeMs).not.toBeNull();

      const game = await t.prisma.onlineGame.findUniqueOrThrow({ where: { id: gameId } });
      expect(game.status).toBe('CHECKMATE');
      expect(game.winnerColor).toBe('BLACK');
      expect(game.endedAt).not.toBeNull();
      expect(game.pgn).toContain('Qh4#');
      expect(game.pgn).toContain('0-1');
      expect(game.whiteTimeLeftMs ?? 0).toBeLessThanOrEqual(180_000);
      expect(game.blackTimeLeftMs ?? 0).toBeLessThanOrEqual(180_000);

      // Jonli soat yozuvi tozalandi — yakuniy holat PostgreSQL'da.
      expect(await t.redis.get(`game:clock:${gameId}`)).toBeNull();
    });

    it("tugagan o'yinda yurish → game_not_active", async () => {
      const ack = await emitAck<{ ok: boolean; error: Record<string, unknown> }>(
        socketA,
        'game:move',
        { gameId, from: 'e2', to: 'e4' },
      );
      expect(ack.ok).toBe(false);
      expect(ack.error.code).toBe('game_not_active');
    });

    it("ommaviy tomoshabin REST ko'rinishi — auth'siz (deny→404 emas, bu ochiq resurs)", async () => {
      const res = await request(t.server).get(`/api/v1/play/games/${gameId}`);
      expect(res.status).toBe(200);
      expect(res.body.status).toBe('CHECKMATE');
      expect(res.body.moves).toEqual(['f3', 'e5', 'g4', 'Qh4#']);
      expect(res.body.viewerRole).toBe('spectator');
    });
  });

  // --- Anonim tomoshabin: WS ham REST kabi ochiq (K-18) ---------------------------

  describe('anonim tomoshabin (tokensiz WS)', () => {
    let anon: ClientSocket;
    let liveGameId = '';

    beforeAll(async () => {
      // Tokensiz ulanish — ilgari `token_expired` bilan darhol uzilardi,
      // holbuki REST `GET /play/games/:id` @Public. Shu nomuvofiqlik
      // K-18 topilmasi edi.
      anon = await connectAnonymous();
      liveGameId = await createChallenge(tokenA, playerIdB);
      await emitAck(socketA, 'game:join', { gameId: liveGameId });
      await emitAck(socketB, 'game:join', { gameId: liveGameId });
    });

    it("tokensiz ulanish QABUL qilinadi — REST bilan bir xil ochiqlik", () => {
      expect(anon.connected).toBe(true);
    });

    it('join → spectator snapshot (REST bergan ko`rinishning AYNAN o`zi)', async () => {
      const ack = await emitAck<{ ok: boolean; data: Record<string, unknown> }>(
        anon,
        'game:join',
        { gameId: liveGameId },
      );
      expect(ack.ok).toBe(true);
      expect(ack.data.viewerRole).toBe('spectator');

      const rest = await request(t.server).get(`/api/v1/play/games/${liveGameId}`);
      // Yangi ma'lumot OCHILMAYDI: WS snapshot ommaviy REST javobi bilan
      // bir xil maydonlarni beradi.
      expect(ack.data.fen).toBe(rest.body.fen);
      expect(ack.data.moves).toEqual(rest.body.moves);
      expect(ack.data.status).toBe(rest.body.status);
    });

    it('JONLI yangilanish oladi — yurish anonim socketga ham yetadi', async () => {
      const broadcastP = waitFor<Record<string, unknown>>(anon, 'game:move_made');
      const ack = await emitAck<{ ok: boolean }>(socketA, 'game:move', {
        gameId: liveGameId,
        from: 'e2',
        to: 'e4',
      });
      expect(ack.ok).toBe(true);
      const broadcast = await broadcastP;
      expect(broadcast.san).toBe('e4');
    });

    it('lekin YUROLMAYDI — not_a_player (ochiqlik ≠ huquq)', async () => {
      const ack = await emitAck<{ ok: boolean; error: Record<string, unknown> }>(
        anon,
        'game:move',
        { gameId: liveGameId, from: 'e7', to: 'e5' },
      );
      expect(ack.ok).toBe(false);
      expect(ack.error.code).toBe('not_a_player');
    });

    it('taslim ham qila olmaydi — o`yin holatiga TEGA OLMAYDI', async () => {
      const ack = await emitAck<{ ok: boolean; error: Record<string, unknown> }>(
        anon,
        'game:resign',
        { gameId: liveGameId },
      );
      expect(ack.ok).toBe(false);
      expect(ack.error.code).toBe('not_a_player');
      const game = await t.prisma.onlineGame.findUniqueOrThrow({ where: { id: liveGameId } });
      expect(game.status).toBe('ACTIVE');
    });

    it('BUZUQ token esa baribir RAD etiladi — bu xato, anonimlik emas', async () => {
      // Gateway middleware bosqichida emas, `handleConnection` da rad
      // etadi (docs/07 §7.1 soddalashtirilgan varianti): socket avval
      // ulanadi, keyin `game:error` oladi va UZILADI. Muhimi — yaroqsiz
      // token jimgina "anonim tomoshabin"ga TUSHIRILMAYDI.
      // Listener ULANISHDAN OLDIN qo'yiladi: server `game:error` ni
      // darhol yuborib socket'ni uzadi, ya'ni `connect` kutib turib
      // obuna bo'lish KECH qolardi.
      const socket = io(`http://127.0.0.1:${String(port)}/play`, {
        transports: ['websocket'],
        auth: { token: 'buzuq.token.qiymati' },
        forceNew: true,
        reconnection: false,
      });
      openSockets.push(socket);

      const err = await new Promise<Record<string, unknown>>((resolve, reject) => {
        socket.on('game:error', (p: Record<string, unknown>) => {
          resolve(p);
        });
        setTimeout(() => {
          reject(new Error('game:error kelmadi'));
        }, 8_000);
      });
      expect(err.code).toBe('token_expired');
    });
  });

  // --- Durang taklifi / qabul ------------------------------------------------------------

  it('draw_offer → draw_offered event; draw_accept → DRAW_AGREED (docs/07 §7.2)', async () => {
    const gameId = await createChallenge(tokenA, playerIdB);
    await emitAck(socketA, 'game:join', { gameId });
    await emitAck(socketB, 'game:join', { gameId });

    const offeredP = waitFor<Record<string, unknown>>(socketB, 'game:draw_offered');
    const offerAck = await emitAck<{ ok: boolean }>(socketA, 'game:draw_offer', { gameId });
    expect(offerAck.ok).toBe(true);
    const offered = await offeredP;
    expect(offered.from).toBe('w');

    // O'z taklifini o'zi qabul qila olmaydi.
    const selfAccept = await emitAck<{ ok: boolean; error: Record<string, unknown> }>(
      socketA,
      'game:draw_accept',
      { gameId },
    );
    expect(selfAccept.ok).toBe(false);
    expect(selfAccept.error.code).toBe('no_draw_offer');

    const endedP = waitFor<Record<string, unknown>>(socketA, 'game:ended');
    const acceptAck = await emitAck<{ ok: boolean }>(socketB, 'game:draw_accept', { gameId });
    expect(acceptAck.ok).toBe(true);
    const ended = await endedP;
    expect(ended.status).toBe('DRAW_AGREED');
    expect(ended.winnerColor).toBeNull();

    const game = await t.prisma.onlineGame.findUniqueOrThrow({ where: { id: gameId } });
    expect(game.status).toBe('DRAW_AGREED');
    expect(game.winnerColor).toBeNull();
  });

  // --- Resign ------------------------------------------------------------------------------

  it("resign → RESIGNATION, g'olib raqib (docs/07 §4)", async () => {
    const gameId = await createChallenge(tokenA, playerIdB);
    await emitAck(socketA, 'game:join', { gameId });
    await emitAck(socketB, 'game:join', { gameId });

    const endedP = waitFor<Record<string, unknown>>(socketB, 'game:ended');
    const ack = await emitAck<{ ok: boolean }>(socketA, 'game:resign', { gameId });
    expect(ack.ok).toBe(true);
    const ended = await endedP;
    expect(ended.status).toBe('RESIGNATION');
    expect(ended.winnerColor).toBe('BLACK');

    // Ikkinchi resign — idempotentlik: o'yin allaqachon tugagan.
    const again = await emitAck<{ ok: boolean; error: Record<string, unknown> }>(
      socketA,
      'game:resign',
      { gameId },
    );
    expect(again.ok).toBe(false);
    expect(again.error.code).toBe('game_not_active');
  });

  // --- claim_timeout rad -----------------------------------------------------------------

  it('claim_timeout: raqibda vaqt bor → rad (time_remains, docs/07 §3.5)', async () => {
    const gameId = await createChallenge(tokenA, playerIdB);
    await emitAck(socketA, 'game:join', { gameId });

    const ack = await emitAck<{ ok: boolean; data: Record<string, unknown> }>(
      socketA,
      'game:claim_timeout',
      { gameId },
    );
    expect(ack.ok).toBe(true);
    expect(ack.data.accepted).toBe(false);
    expect(ack.data.remainingMs).toBeGreaterThan(0);

    const game = await t.prisma.onlineGame.findUniqueOrThrow({ where: { id: gameId } });
    expect(game.status).toBe('ACTIVE');

    // Tozalash: abort (yurish yo'q — oyna ochiq).
    const abortAck = await emitAck<{ ok: boolean }>(socketA, 'game:abort', { gameId });
    expect(abortAck.ok).toBe(true);
  });

  // --- Matchmaking ---------------------------------------------------------------------------

  it("matchmaking: ikki o'yinchi bitta chelakda → DARHOL juftlik + matchmaking:matched", async () => {
    const bucket = {
      timeCategory: 'BLITZ',
      clockType: 'FISCHER_INCREMENT',
      baseTimeSeconds: 180,
      incrementSeconds: 2,
    };

    const matchedAP = waitFor<{ gameId: string }>(socketA, 'matchmaking:matched', 10_000);
    const matchedBP = waitFor<{ gameId: string }>(socketB, 'matchmaking:matched', 10_000);

    const joinA = await request(t.server)
      .post('/api/v1/play/matchmaking/join')
      .set(bearer(tokenA))
      .send(bucket);
    expect(joinA.status).toBe(200);
    expect(joinA.body.status).toBe('queued');

    // Ikki marta navbatga turish taqiqlangan (docs/07 §9.5 #5).
    const dup = await request(t.server)
      .post('/api/v1/play/matchmaking/join')
      .set(bearer(tokenA))
      .send(bucket);
    expect(dup.status).toBe(422);

    const joinB = await request(t.server)
      .post('/api/v1/play/matchmaking/join')
      .set(bearer(tokenB))
      .send(bucket);
    expect(joinB.status).toBe(200);
    expect(joinB.body.status).toBe('matched');
    const gameId = joinB.body.gameId as string;

    const [matchedA, matchedB] = await Promise.all([matchedAP, matchedBP]);
    expect(matchedA.gameId).toBe(gameId);
    expect(matchedB.gameId).toBe(gameId);

    // O'yin darhol ACTIVE va REYTINGLI; uzoqroq kutgan (A) — OQ.
    const game = await t.prisma.onlineGame.findUniqueOrThrow({ where: { id: gameId } });
    expect(game.status).toBe('ACTIVE');
    expect(game.isRated).toBe(true);

    // Abort oynasi (yurishlar yo'q) — docs/07 §4: 1-yurishgacha.
    await emitAck(socketA, 'game:join', { gameId });
    const endedP = waitFor<Record<string, unknown>>(socketA, 'game:ended');
    const abortAck = await emitAck<{ ok: boolean }>(socketB, 'game:abort', { gameId });
    expect(abortAck.ok).toBe(true);
    const ended = await endedP;
    expect(ended.status).toBe('ABORTED');

    // Navbat markerlari tozalangan — qayta turish mumkin, keyin chiqish.
    const rejoin = await request(t.server)
      .post('/api/v1/play/matchmaking/join')
      .set(bearer(tokenA))
      .send(bucket);
    expect(rejoin.status).toBe(200);
    expect(rejoin.body.status).toBe('queued');
    const leave = await request(t.server)
      .post('/api/v1/play/matchmaking/leave')
      .set(bearer(tokenA))
      .send();
    expect(leave.status).toBe(200);
    expect(leave.body.left).toBe(true);
  });
});
