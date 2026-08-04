import request from 'supertest';

import { createTestApp, type TestApp } from './app.harness';
import {
  bearer,
  expectProblem,
  grantRole,
  registerUser,
  resetState,
  userIdFromToken,
} from './helpers';

/**
 * Rating moduli — to'liq API oqimi (docs/14-roadmap.md Faza 3 DoD):
 *
 *  1. mini-turnir (2 o'yinchi, 1 tur, WHITE_WIN, tur COMPLETED) —
 *     audit-atomicity.spec.ts uslubidagi fixture;
 *  2. SUPER_ADMIN davr yaratadi (hozirni qamraydi) va hisoblaydi;
 *  3. PlayerRating: g'olib > 1500 > yutqazgan; RatingHistory inputGames
 *     bilan; davr computedAt to'ldirilgan;
 *  4. QAYTA hisoblash (bir xil sabab) → AYNAN bir xil qiymatlar
 *     (IDEMPOTENT — DoD talabi) va recomputeGeneration = 1;
 *  5. leaderboard bo'sh (ikkalasi provisional — bittagina o'yin);
 *  6. reyting tarixi endpointi yozuvlarni qaytaradi.
 *
 * ⚠️  Register limiti 3/soat IP (docs/10-security.md §7.1) — bu faylda
 *     AYNAN 3 foydalanuvchi yaratiladi.
 *
 * Testlar KETMA-KET bitta oqim holatini bo'lishadi (jest fayl ichida
 * tartibni kafolatlaydi).
 */
describe('Rating (integration)', () => {
  let t: TestApp;

  let adminToken: string;
  let whitePlayerId: string;
  let blackPlayerId: string;
  let periodId: string;

  /** Birinchi hisobdan keyingi qiymatlar — idempotentlik taqqoslash uchun. */
  let firstComputeSnapshot: {
    playerId: string;
    rating: string;
    deviation: string;
    volatility: string;
    gamesPlayed: number;
    isProvisional: boolean;
  }[];

  beforeAll(async () => {
    t = await createTestApp();
    await resetState(t.prisma, t.redis);

    const admin = await registerUser(t.server, { email: 'rating-admin@test.uz' });
    adminToken = admin.body.accessToken as string;
    await grantRole(t.prisma, t.redis, userIdFromToken(adminToken), 'SUPER_ADMIN');

    const p1 = await registerUser(t.server, {
      email: 'rating-p1@test.uz',
      firstName: 'Alisher',
      lastName: 'Karimov',
    });
    const p2 = await registerUser(t.server, {
      email: 'rating-p2@test.uz',
      firstName: 'Bobur',
      lastName: 'Toshev',
    });

    // --- Mini-turnir: OTB RAPID, round-robin, 1 tur ------------------------
    const tournament = await request(t.server)
      .post('/api/v1/tournaments')
      .set(bearer(adminToken))
      .send({
        name: 'Reyting sinov turniri',
        slug: 'reyting-sinov-2026',
        startDate: '2026-07-25T09:00:00.000+05:00',
        endDate: '2026-07-25T18:00:00.000+05:00',
      });
    expect(tournament.status).toBe(201);
    const tournamentId = tournament.body.id as string;

    const section = await request(t.server)
      .post(`/api/v1/tournaments/${tournamentId}/sections`)
      .set(bearer(adminToken))
      .send({
        name: 'A guruh',
        pairingSystem: 'ROUND_ROBIN',
        timeCategory: 'RAPID',
        environment: 'OTB',
        totalRounds: 1,
        clockType: 'FISCHER_INCREMENT',
        baseTimeSeconds: 900,
        incrementSeconds: 10,
      });
    expect(section.status).toBe(201);
    const sectionId = section.body.id as string;

    const changeStatus = async (status: string): Promise<void> => {
      const res = await request(t.server)
        .post(`/api/v1/tournaments/${tournamentId}/status`)
        .set(bearer(adminToken))
        .send({ status });
      expect(res.status).toBe(200);
    };

    await changeStatus('REGISTRATION_OPEN');
    const registrationIds = new Map<string, string>(); // registrationId → playerId
    for (const token of [p1.body.accessToken as string, p2.body.accessToken as string]) {
      const reg = await request(t.server)
        .post(`/api/v1/sections/${sectionId}/registrations`)
        .set(bearer(token))
        .send({});
      expect(reg.status).toBe(201);
      // Faza 3 hook: hech qachon o'ynamagan o'yinchi → ratingAtEntry null
      // (1500 deb taxmin qilinmaydi — rating.port.ts).
      expect(reg.body.ratingAtEntry).toBeNull();
      registrationIds.set(reg.body.id as string, reg.body.playerId as string);
    }
    await changeStatus('REGISTRATION_CLOSED');
    await changeStatus('IN_PROGRESS');

    const round = await request(t.server)
      .post(`/api/v1/sections/${sectionId}/rounds`)
      .set(bearer(adminToken))
      .send();
    expect(round.status).toBe(201);
    expect(round.body.pairings).toHaveLength(1);
    const pairing = round.body.pairings[0] as {
      id: string;
      whiteRegistrationId: string;
      blackRegistrationId: string;
    };
    whitePlayerId = registrationIds.get(pairing.whiteRegistrationId)!;
    blackPlayerId = registrationIds.get(pairing.blackRegistrationId)!;

    const result = await request(t.server)
      .patch(`/api/v1/pairings/${pairing.id}/result`)
      .set(bearer(adminToken))
      .send({ result: 'WHITE_WIN' });
    expect(result.status).toBe(200);

    const completed = await request(t.server)
      .post(`/api/v1/rounds/${round.body.id as string}/complete`)
      .set(bearer(adminToken))
      .send();
    expect(completed.status).toBe(200);
  });

  afterAll(async () => {
    await t.close();
  });

  it('OTB + BULLET davri yaratilmaydi — 422 (docs/06 §5.1)', async () => {
    const res = await request(t.server)
      .post('/api/v1/rating-periods')
      .set(bearer(adminToken))
      .send({
        environment: 'OTB',
        timeCategory: 'BULLET',
        startsAt: '2026-07-01T00:00:00.000+05:00',
        endsAt: '2026-08-01T00:00:00.000+05:00',
      });
    expectProblem(res, 422, 'INVALID_RATING_CATEGORY');
  });

  it("davr yaratiladi — default tau 0.5, computedAt bo'sh", async () => {
    const res = await request(t.server)
      .post('/api/v1/rating-periods')
      .set(bearer(adminToken))
      .send({
        environment: 'OTB',
        timeCategory: 'RAPID',
        startsAt: '2026-07-01T00:00:00.000+05:00',
        endsAt: '2026-08-01T00:00:00.000+05:00',
      });
    expect(res.status).toBe(201);
    expect(res.body.tau).toBe(0.5);
    expect(res.body.computedAt).toBeNull();
    expect(res.body.recomputeGeneration).toBe(0);
    periodId = res.body.id as string;
  });

  it('kesishuvchi davr → 409', async () => {
    const res = await request(t.server)
      .post('/api/v1/rating-periods')
      .set(bearer(adminToken))
      .send({
        environment: 'OTB',
        timeCategory: 'RAPID',
        startsAt: '2026-07-15T00:00:00.000+05:00',
        endsAt: '2026-08-15T00:00:00.000+05:00',
      });
    expectProblem(res, 409, 'CONFLICT');
  });

  it("birinchi hisob: g'olib > 1500 > yutqazgan, history inputGames bilan, davr meta to'ldirilgan", async () => {
    const res = await request(t.server)
      .post(`/api/v1/rating-periods/${periodId}/compute`)
      .set(bearer(adminToken))
      .send({ reason: 'Iyul davri yakuni — birinchi hisob' });
    expect(res.status).toBe(200);
    expect(res.body.computedAt).not.toBeNull();
    expect(res.body.playersAffected).toBe(2);
    expect(res.body.gamesProcessed).toBe(1);
    // Birinchi hisob — recompute EMAS.
    expect(res.body.recomputeGeneration).toBe(0);

    const ratings = await t.prisma.playerRating.findMany({
      where: { environment: 'OTB', timeCategory: 'RAPID' },
      orderBy: { playerId: 'asc' },
    });
    expect(ratings).toHaveLength(2);

    const white = ratings.find((r) => r.playerId === whitePlayerId)!;
    const black = ratings.find((r) => r.playerId === blackPlayerId)!;
    expect(white.rating.toNumber()).toBeGreaterThan(1500);
    expect(black.rating.toNumber()).toBeLessThan(1500);
    expect(white.gamesPlayed).toBe(1);
    expect(black.gamesPlayed).toBe(1);
    // Bittagina o'yin — ikkalasi ham provisional (docs/06 §4.2).
    expect(white.isProvisional).toBe(true);
    expect(black.isProvisional).toBe(true);
    expect(white.lastPeriodId).toBe(periodId);

    const history = await t.prisma.ratingHistory.findMany({
      where: { periodId },
      orderBy: { playerId: 'asc' },
    });
    expect(history).toHaveLength(2);
    for (const row of history) {
      expect(row.gamesInPeriod).toBe(1);
      expect(row.ratingBefore.toNumber()).toBe(1500);
      const inputGames = row.inputGames as {
        opponentId: string;
        opponentRating: number;
        opponentRd: number;
        score: number;
      }[];
      expect(inputGames).toHaveLength(1);
      // Raqib snapshot'i — davr boshidagi standart holat.
      expect(inputGames[0]!.opponentRating).toBe(1500);
      expect(inputGames[0]!.opponentRd).toBe(350);
    }

    // Audit: rating.recalculated — sabab bilan, BIR tranzaksiyada.
    const audit = await t.prisma.auditLog.findMany({
      where: { action: 'rating.recalculated', resourceId: periodId },
    });
    expect(audit).toHaveLength(1);
    expect((audit[0]!.after as { reason?: string }).reason).toBe(
      'Iyul davri yakuni — birinchi hisob',
    );

    firstComputeSnapshot = ratings.map((r) => ({
      playerId: r.playerId,
      rating: r.rating.toString(),
      deviation: r.deviation.toString(),
      volatility: r.volatility.toString(),
      gamesPlayed: r.gamesPlayed,
      isProvisional: r.isProvisional,
    }));
  });

  it('QAYTA hisoblash → aynan bir xil qiymatlar (idempotent) va recomputeGeneration = 1', async () => {
    const res = await request(t.server)
      .post(`/api/v1/rating-periods/${periodId}/compute`)
      .set(bearer(adminToken))
      .send({ reason: 'Iyul davri yakuni — birinchi hisob' });
    expect(res.status).toBe(200);
    expect(res.body.recomputeGeneration).toBe(1);
    expect(res.body.playersAffected).toBe(2);
    expect(res.body.gamesProcessed).toBe(1);

    const ratings = await t.prisma.playerRating.findMany({
      where: { environment: 'OTB', timeCategory: 'RAPID' },
      orderBy: { playerId: 'asc' },
    });
    const snapshot = ratings.map((r) => ({
      playerId: r.playerId,
      rating: r.rating.toString(),
      deviation: r.deviation.toString(),
      volatility: r.volatility.toString(),
      gamesPlayed: r.gamesPlayed,
      isProvisional: r.isProvisional,
    }));
    // DoD: ikki marta hisoblash → BIR XIL natija (docs/06 §9.3).
    expect(snapshot).toEqual(firstComputeSnapshot);

    // History UPSERT — yozuvlar ko'paymaydi (bir davr × o'yinchi = 1 yozuv).
    const history = await t.prisma.ratingHistory.findMany({ where: { periodId } });
    expect(history).toHaveLength(2);

    // Outbox: har hisob RatingRecomputed event yozadi (at-least-once).
    const events = await t.prisma.outboxEvent.findMany({
      where: { eventType: 'RatingRecomputed', aggregateId: periodId },
    });
    expect(events.length).toBeGreaterThanOrEqual(2);
  });

  it("leaderboard bo'sh — ikkala o'yinchi provisional (docs/06 §4.2)", async () => {
    const res = await request(t.server)
      .get('/api/v1/ratings')
      .query({ environment: 'OTB', timeCategory: 'RAPID' });
    expect(res.status).toBe(200);
    expect(res.body.items).toEqual([]);
    expect(res.body.pageInfo.hasNextPage).toBe(false);
  });

  it('reyting tarixi endpointi yozuvlarni qaytaradi (RD ochiq)', async () => {
    const res = await request(t.server)
      .get(`/api/v1/players/${whitePlayerId}/rating-history`)
      .query({ environment: 'OTB', timeCategory: 'RAPID' });
    expect(res.status).toBe(200);
    expect(res.body.items).toHaveLength(1);

    const row = res.body.items[0] as {
      periodId: string;
      ratingBefore: number;
      ratingAfter: number;
      deviationBefore: number;
      deviationAfter: number;
      gamesInPeriod: number;
    };
    expect(row.periodId).toBe(periodId);
    expect(row.ratingBefore).toBe(1500);
    expect(row.ratingAfter).toBeGreaterThan(1500);
    // O'yin o'ynash RD ni kamaytiradi; RD javobda ochiq ko'rinadi.
    expect(row.deviationAfter).toBeLessThan(row.deviationBefore);
    expect(row.gamesInPeriod).toBe(1);
  });

  it("davrlar ro'yxati ommaviy o'qiladi", async () => {
    const res = await request(t.server)
      .get('/api/v1/rating-periods')
      .query({ environment: 'OTB', timeCategory: 'RAPID' });
    expect(res.status).toBe(200);
    expect(res.body.items).toHaveLength(1);
    expect(res.body.items[0].id).toBe(periodId);
    expect(res.body.items[0].recomputeGeneration).toBe(1);
  });
});
