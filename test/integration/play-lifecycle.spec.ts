import { io, type Socket as ClientSocket } from 'socket.io-client';
import request from 'supertest';

import { bearer, grantRole, registerUser, resetState, userIdFromToken } from './helpers';
import { createTestApp, type TestApp } from './app.harness';
import { GameTimers } from '../../src/modules/play/game-timers';
import { PlayService } from '../../src/modules/play/play.service';

/**
 * Play hayot sikli — Faza 5 DoD qoldiqlari (docs/07-realtime-and-clock.md):
 *
 *  1. PROAKTIV FLAG (§3.5 2-yo'l): 5s bazali o'yin, qora jim turadi →
 *     server O'ZI TIMEOUT e'lon qiladi (claim'siz) + §3.7 clock_update tick;
 *  2. DISKONNEKT/RECONNECT (§3.8, §8): opponent_gone {graceMs} →
 *     grace ichida qaytish → opponent_back + game:join ack'ida TO'LIQ
 *     resync snapshot (reconnect shartnomasi);
 *  3. ABANDONMENT: qaytmasa grace tugagach ABANDONED, ulangan o'yinchi
 *     g'olib (winnerColor semantikasi play.service hujjatida);
 *  4. ONLINE REYTING MANBAI (docs/06 §5): matchmaking'dan reytingli RAPID
 *     o'yin (tez resign) → ONLINE_RAPID davri compute → g'olib>1500>yutqazgan,
 *     RatingHistory.inputGames o'yinga (OnlineGame.id) ishora qiladi.
 *
 * Grace testda qisqartiriladi: PLAY_DISCONNECT_GRACE_MS=2000 env override
 * (configuration.ts) — AppModule dinamik importidan OLDIN qo'yiladi.
 * Davr oynasi HAR DOIM "hozir"ga nisbatan dinamik (rating.spec.ts saboqli
 * pattern'i — sana hardcode qilinmaydi).
 *
 * ⚠️  Register limiti 3/soat IP — bu faylda AYNAN 3 foydalanuvchi
 *     (oq, qora, admin); resetState limiter kalitlarini tozalaydi.
 */
describe('play lifecycle (integration)', () => {
  const GRACE_MS = 2_000;

  let t: TestApp;
  let port: number;

  let tokenA = ''; // odatda OQ (chaqiruvchi / navbatga birinchi turgan)
  let tokenB = '';
  let adminToken = '';
  let playerIdA = '';
  let playerIdB = '';

  let socketA: ClientSocket;
  let socketB: ClientSocket;
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

  /** Muayyan o'yinga tegishli eventni kutish (boshqa o'yin shovqinini filtrlaydi). */
  function waitForGameEvent<T extends { gameId?: unknown }>(
    socket: ClientSocket,
    event: string,
    gameId: string,
    timeoutMs = 8_000,
  ): Promise<T> {
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        socket.off(event, handler);
        reject(new Error(`event kutish timeout: ${event} (game=${gameId})`));
      }, timeoutMs);
      function handler(payload: T): void {
        if (payload.gameId !== gameId) {
          return;
        }
        clearTimeout(timer);
        socket.off(event, handler);
        resolve(payload);
      }
      socket.on(event, handler);
    });
  }

  async function createChallenge(overrides: Record<string, unknown> = {}): Promise<string> {
    const res = await request(t.server)
      .post('/api/v1/play/challenges')
      .set(bearer(tokenA))
      .send({
        opponentPlayerId: playerIdB,
        timeCategory: 'BLITZ',
        clockType: 'SUDDEN_DEATH',
        baseTimeSeconds: 180,
        incrementSeconds: 0,
        ...overrides,
      });
    expect(res.status).toBe(201);
    return res.body.gameId as string;
  }

  async function joinBoth(gameId: string): Promise<void> {
    const ackA = await emitAck<{ ok: boolean }>(socketA, 'game:join', { gameId });
    const ackB = await emitAck<{ ok: boolean }>(socketB, 'game:join', { gameId });
    expect(ackA.ok).toBe(true);
    expect(ackB.ok).toBe(true);
  }

  async function moveOk(
    socket: ClientSocket,
    gameId: string,
    from: string,
    to: string,
  ): Promise<void> {
    const ack = await emitAck<{ ok: boolean }>(socket, 'game:move', { gameId, from, to });
    expect(ack.ok).toBe(true);
  }

  // --- Hayot sikli ------------------------------------------------------------------

  beforeAll(async () => {
    // Grace override — AppModule (va demak configuration.ts) dinamik
    // importidan OLDIN (app.harness.ts izohi).
    process.env.PLAY_DISCONNECT_GRACE_MS = String(GRACE_MS);

    t = await createTestApp();
    await resetState(t.prisma, t.redis);

    await t.app.listen(0);
    const address = t.server.address();
    if (address === null || typeof address === 'string') {
      throw new Error('server porti aniqlanmadi');
    }
    port = address.port;

    const resA = await registerUser(t.server, { email: 'lifecycle-white@farzin.uz' });
    const resB = await registerUser(t.server, { email: 'lifecycle-black@farzin.uz' });
    const resAdmin = await registerUser(t.server, { email: 'lifecycle-admin@farzin.uz' });
    expect(resA.status).toBe(201);
    expect(resB.status).toBe(201);
    expect(resAdmin.status).toBe(201);
    tokenA = resA.body.accessToken as string;
    tokenB = resB.body.accessToken as string;
    adminToken = resAdmin.body.accessToken as string;
    await grantRole(t.prisma, t.redis, userIdFromToken(adminToken), 'SUPER_ADMIN');

    const playerA = await t.prisma.player.findFirst({ where: { userId: userIdFromToken(tokenA) } });
    const playerB = await t.prisma.player.findFirst({ where: { userId: userIdFromToken(tokenB) } });
    if (playerA === null || playerB === null) {
      throw new Error('registratsiya Player profilini yaratmadi');
    }
    playerIdA = playerA.id;
    playerIdB = playerB.id;

    socketA = await connectPlay(tokenA);
    socketB = await connectPlay(tokenB);
  });

  afterAll(async () => {
    delete process.env.PLAY_DISCONNECT_GRACE_MS;
    for (const s of openSockets) {
      if (s.connected) {
        s.disconnect();
      }
    }
    await t.close();
  });

  // --- 1. Proaktiv flag taymeri (§3.5) + clock_update tick (§3.7) --------------------

  it("proaktiv flag: 5s bazali o'yinda qora jim tursa server O'ZI TIMEOUT e'lon qiladi", async () => {
    const gameId = await createChallenge({
      timeCategory: 'BULLET',
      baseTimeSeconds: 5,
    });
    await joinBoth(gameId);

    // Oqning 1-yurishi bepul — shundan keyin QORA soati yura boshlaydi (§3.8).
    const endedAP = waitForGameEvent<Record<string, unknown>>(socketA, 'game:ended', gameId, 9_000);
    const endedBP = waitForGameEvent<Record<string, unknown>>(socketB, 'game:ended', gameId, 9_000);
    // §3.7 tick 5s oralig'ida — flag'dan (5s+ε) sal oldin keladi.
    const tickP = waitForGameEvent<{ gameId: string; clock: Record<string, unknown> }>(
      socketA,
      'game:clock_update',
      gameId,
      9_000,
    );
    await moveOk(socketA, gameId, 'e2', 'e4');

    // Hech kim claim yubormaydi — server taymeri o'zi ishlashi SHART.
    const tick = await tickP;
    expect(tick.clock.running).toBe('b');
    expect(tick.clock.blackMs as number).toBeLessThanOrEqual(5_000);

    const [endedA, endedB] = await Promise.all([endedAP, endedBP]);
    expect(endedA.status).toBe('TIMEOUT');
    expect(endedA.winnerColor).toBe('WHITE'); // oqda material yetarli (FIDE 6.9)
    expect(endedB.status).toBe('TIMEOUT');
    expect((endedA.clock as Record<string, unknown>).blackMs).toBe(0);

    const game = await t.prisma.onlineGame.findUniqueOrThrow({ where: { id: gameId } });
    expect(game.status).toBe('TIMEOUT');
    expect(game.winnerColor).toBe('WHITE');
    expect(game.endedAt).not.toBeNull();
    expect(game.blackTimeLeftMs).toBe(0);

    // Jonli soat yozuvi tozalandi (taymerlar ham — open handle qolmaydi).
    expect(await t.redis.get(`game:clock:${gameId}`)).toBeNull();
  }, 20_000);

  // --- 1b. FLAG SUPURGICHI: instansiya o'lsa ham vaqt tugashi e'lon qilinadi ---------

  it("instansiya o'lsa proaktiv taymer yo'qoladi — SUPURGICH o'yinni tugatadi", async () => {
    const gameId = await createChallenge({
      timeCategory: 'BULLET',
      baseTimeSeconds: 5,
    });
    await joinBoth(gameId);

    const endedAP = waitForGameEvent<Record<string, unknown>>(socketA, 'game:ended', gameId, 20_000);
    await moveOk(socketA, gameId, 'e2', 'e4');

    // ═══════════════════════════════════════════════════════════════════
    //  INSTANSIYA O'LIMINI TAQLID QILAMIZ
    //
    //  Yurishdan keyin gateway mahalliy flag taymerini qo'yadi. Uni
    //  o'chirish — taymer o'z instansiyasi bilan ketishiga TENG.
    //  Boshqa hech narsa uni qayta qo'ymaydi (clearGame flag + tick).
    // ═══════════════════════════════════════════════════════════════════
    const timers = t.app.get(GameTimers);
    timers.clearGame(gameId);

    // Qora soati 5s — u tugaydi, lekin e'lon qiladigan hech kim yo'q.
    // Supurgich nomzodi bo'lishi uchun o'yin FLAG_SWEEP_IDLE_MS (10s)
    // qimirlamagan bo'lishi kerak.
    await new Promise((r) => setTimeout(r, 11_000));

    // NAZORAT: proaktiv yo'l HAQIQATAN yo'qolgan — o'yin hali ACTIVE.
    const before = await t.prisma.onlineGame.findUniqueOrThrow({ where: { id: gameId } });
    expect(before.status).toBe('ACTIVE');

    // Boshqa instansiya supuradi (bu yerda: shu process, lekin kod yo'li
    // AYNAN o'sha — @Interval bilan har nodeda ishlaydi).
    await t.app.get(PlayService).sweepExpiredFlags();

    const game = await t.prisma.onlineGame.findUniqueOrThrow({ where: { id: gameId } });
    expect(game.status).toBe('TIMEOUT');
    expect(game.winnerColor).toBe('WHITE');
    expect(game.blackTimeLeftMs).toBe(0);

    // Room'ga xabar YETDI — o'yinchi ekranida o'yin tugagan ko'rinadi.
    const ended = await endedAP;
    expect(ended.status).toBe('TIMEOUT');
    expect(ended.winnerColor).toBe('WHITE');
  }, 40_000);

  it('supurgich vaqti tugamagan o`yinga TEGMAYDI', async () => {
    // Uzoq nazorat: 10s dan ko'p qimirlamasa ham vaqti tugamagan.
    const gameId = await createChallenge({
      timeCategory: 'BLITZ',
      baseTimeSeconds: 600,
    });
    await joinBoth(gameId);
    await moveOk(socketA, gameId, 'd2', 'd4');
    t.app.get(GameTimers).clearGame(gameId);

    await new Promise((r) => setTimeout(r, 11_000));
    await t.app.get(PlayService).sweepExpiredFlags();

    const game = await t.prisma.onlineGame.findUniqueOrThrow({ where: { id: gameId } });
    expect(game.status).toBe('ACTIVE');
  }, 40_000);

  // --- 2. Diskonnekt → opponent_gone; reconnect → opponent_back + resync (§8) --------

  it("diskonnekt: opponent_gone {graceMs}; grace ichida qaytish: opponent_back + TO'LIQ snapshot", async () => {
    const gameId = await createChallenge();
    await joinBoth(gameId);
    await moveOk(socketA, gameId, 'e2', 'e4');
    await moveOk(socketB, gameId, 'e7', 'e5');

    // Presence markerlari (docs/07 §3.8) — ikkala rang ham joyida.
    expect(await t.redis.exists(`game:presence:${gameId}:w`)).toBe(1);
    expect(await t.redis.exists(`game:presence:${gameId}:b`)).toBe(1);

    const goneP = waitForGameEvent<{ gameId: string; side: string; graceMs: number }>(
      socketA,
      'game:opponent_gone',
      gameId,
    );
    socketB.disconnect();
    const gone = await goneP;
    expect(gone.side).toBe('b');
    expect(gone.graceMs).toBe(GRACE_MS);
    expect(await t.redis.exists(`game:presence:${gameId}:b`)).toBe(0);

    // Grace ichida qaytish — soat TO'XTAMAGAN edi (§3.8 qattiq qoida).
    const backP = waitForGameEvent<{ gameId: string; side: string }>(
      socketA,
      'game:opponent_back',
      gameId,
    );
    socketB = await connectPlay(tokenB);
    const ack = await emitAck<{ ok: boolean; data: Record<string, unknown> }>(
      socketB,
      'game:join',
      { gameId },
    );
    const back = await backP;
    expect(back.side).toBe('b');

    // RECONNECT SHARTNOMASI (§8.1): ack — to'liq game:state snapshot.
    expect(ack.ok).toBe(true);
    expect(ack.data.status).toBe('ACTIVE');
    expect(ack.data.viewerRole).toBe('black');
    expect(ack.data.moves).toEqual(['e4', 'e5']);
    expect(ack.data.fen).toContain('rnbqkbnr/pppp1ppp/8/4p3/4P3/8/PPPP1PPP/RNBQKBNR w');
    const clock = ack.data.clock as { whiteMs: number; blackMs: number; running: string };
    expect(clock.running).toBe('w'); // navbat oqda — soat Redis'dan "hozir" kesimida
    expect(clock.whiteMs).toBeGreaterThan(0);
    expect(clock.whiteMs).toBeLessThanOrEqual(180_000);
    expect(clock.blackMs).toBeLessThanOrEqual(180_000);
    expect(ack.data.drawOfferFrom).toBeNull();
    expect(await t.redis.exists(`game:presence:${gameId}:b`)).toBe(1);

    // Grace bekor bo'lgan — o'yin ABANDONED bo'lib ketmasligiga ishonch:
    // grace davridan uzoqroq kutamiz, o'yin hali ACTIVE.
    await new Promise((r) => setTimeout(r, GRACE_MS + 500));
    const still = await t.prisma.onlineGame.findUniqueOrThrow({ where: { id: gameId } });
    expect(still.status).toBe('ACTIVE');

    // Tozalash.
    const endedP = waitForGameEvent<Record<string, unknown>>(socketA, 'game:ended', gameId);
    await emitAck(socketB, 'game:resign', { gameId });
    await endedP;
  }, 20_000);

  // --- 3. Abandonment: grace tugadi, qaytmadi → ABANDONED (§3.8, §4) ------------------

  it("abandonment: qaytmagan o'yinchi grace tugagach yutqazadi — ABANDONED, ulangan g'olib", async () => {
    const gameId = await createChallenge();
    await joinBoth(gameId);
    await moveOk(socketA, gameId, 'd2', 'd4');
    await moveOk(socketB, gameId, 'd7', 'd5');

    const goneP = waitForGameEvent<{ gameId: string; graceMs: number }>(
      socketA,
      'game:opponent_gone',
      gameId,
    );
    const endedP = waitForGameEvent<Record<string, unknown>>(
      socketA,
      'game:ended',
      gameId,
      GRACE_MS + 6_000,
    );
    socketB.disconnect();
    await goneP;

    // Qaytish YO'Q → grace (2s) tugagach server ABANDONED e'lon qiladi.
    const ended = await endedP;
    expect(ended.status).toBe('ABANDONED');
    expect(ended.winnerColor).toBe('WHITE'); // ulangan o'yinchi (A=oq) g'olib

    const game = await t.prisma.onlineGame.findUniqueOrThrow({ where: { id: gameId } });
    expect(game.status).toBe('ABANDONED');
    expect(game.winnerColor).toBe('WHITE');
    expect(game.endedAt).not.toBeNull();
    expect(game.whiteTimeLeftMs).not.toBeNull();
    expect(game.blackTimeLeftMs).not.toBeNull();

    // Redis izlari (soat + presence) supurildi.
    expect(await t.redis.get(`game:clock:${gameId}`)).toBeNull();
    expect(await t.redis.exists(`game:presence:${gameId}:w`)).toBe(0);
  }, 20_000);

  // --- 4. Onlayn reytingli o'yin → ONLINE_RAPID davri (docs/06 §5) --------------------

  it("reyting: matchmaking o'yini (resign) → ONLINE RAPID compute → g'olib>1500>yutqazgan, inputGames o'yinga ishora", async () => {
    // B avvalgi testda uzilgan — yangi socket.
    socketB = await connectPlay(tokenB);

    // 15+0 = 15 daqiqa → RAPID. Ilgari bu yerda 10+0 turardi va test
    // uni RAPID deb atardi, lekin docs/06:667 "blits ≤ 10" deydi —
    // ya'ni 10 daqiqa hali BLITZ. Kategoriya tekshiruvi qo'shilgunga
    // qadar (K-19) buni hech narsa ushlamasdi.
    const bucket = {
      timeCategory: 'RAPID',
      clockType: 'SUDDEN_DEATH',
      baseTimeSeconds: 900,
      incrementSeconds: 0,
    };
    const matchedAP = new Promise<{ gameId: string }>((resolve) => {
      socketA.once('matchmaking:matched', (p: { gameId: string }) => {
        resolve(p);
      });
    });
    const joinA = await request(t.server)
      .post('/api/v1/play/matchmaking/join')
      .set(bearer(tokenA))
      .send(bucket);
    expect(joinA.body.status).toBe('queued');
    const joinB = await request(t.server)
      .post('/api/v1/play/matchmaking/join')
      .set(bearer(tokenB))
      .send(bucket);
    expect(joinB.body.status).toBe('matched');
    const gameId = joinB.body.gameId as string;
    expect((await matchedAP).gameId).toBe(gameId);

    // Uzoqroq kutgan (A) — OQ; reytingli o'yin.
    const game = await t.prisma.onlineGame.findUniqueOrThrow({ where: { id: gameId } });
    expect(game.isRated).toBe(true);
    expect(game.whitePlayerId).toBe(playerIdA);

    // Tez natija: qora taslim → RESIGNATION, g'olib OQ (A).
    await joinBoth(gameId);
    const endedP = waitForGameEvent<Record<string, unknown>>(socketA, 'game:ended', gameId);
    await emitAck(socketB, 'game:resign', { gameId });
    const ended = await endedP;
    expect(ended.status).toBe('RESIGNATION');
    expect(ended.winnerColor).toBe('WHITE');

    // Davr oynasi — "hozir"ga nisbatan DINAMIK (rating.spec.ts saboqli).
    const DAY_MS = 24 * 60 * 60 * 1000;
    const periodRes = await request(t.server)
      .post('/api/v1/rating-periods')
      .set(bearer(adminToken))
      .send({
        environment: 'ONLINE',
        timeCategory: 'RAPID',
        startsAt: new Date(Date.now() - DAY_MS).toISOString(),
        endsAt: new Date(Date.now() + DAY_MS).toISOString(),
      });
    expect(periodRes.status).toBe(201);
    const periodId = periodRes.body.id as string;

    const compute = await request(t.server)
      .post(`/api/v1/rating-periods/${periodId}/compute`)
      .set(bearer(adminToken))
      .send({ reason: "Faza 5 DoD — onlayn o'yinlar reyting manbai" });
    expect(compute.status).toBe(200);
    // Faqat SHU o'yin: do'stona (isRated=false) va boshqa kategoriya
    // o'yinlari ONLINE_RAPID davriga KIRMAYDI.
    expect(compute.body.gamesProcessed).toBe(1);
    expect(compute.body.playersAffected).toBe(2);

    const ratings = await t.prisma.playerRating.findMany({
      where: { environment: 'ONLINE', timeCategory: 'RAPID' },
    });
    expect(ratings).toHaveLength(2);
    const winner = ratings.find((r) => r.playerId === playerIdA)!;
    const loser = ratings.find((r) => r.playerId === playerIdB)!;
    expect(winner.rating.toNumber()).toBeGreaterThan(1500);
    expect(loser.rating.toNumber()).toBeLessThan(1500);
    expect(winner.gamesPlayed).toBe(1);

    // RatingHistory.inputGames — o'yinga (OnlineGame.id) ishora qiladi.
    const history = await t.prisma.ratingHistory.findMany({ where: { periodId } });
    expect(history).toHaveLength(2);
    for (const row of history) {
      const inputGames = row.inputGames as { pairingId: string; score: number }[];
      expect(inputGames).toHaveLength(1);
      expect(inputGames[0]!.pairingId).toBe(gameId);
      expect(inputGames[0]!.score).toBe(row.playerId === playerIdA ? 1 : 0);
    }
  }, 30_000);
});
