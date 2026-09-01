import { Role } from '@prisma/client';
import request from 'supertest';

import { createTestApp, type TestApp } from './app.harness';
import { bearer, grantRole, registerUser, resetState, userIdFromToken } from './helpers';

/**
 * Jadval (Standing) — Swiss seksiyasida FLOAT TARIXI.
 *
 * ═══════════════════════════════════════════════════════════════════════════
 *  docs/AUDIT.md JIDDIY-5
 *
 *  `arbiter.service.recomputeStandings` da `floatHistory: []` QATTIQ
 *  yozilgan edi, izohda esa "round-robin'da float yo'q" deyilgan. Lekin bu
 *  metod SWISS_DUTCH seksiyalar uchun ham chaqiriladi — natijada jadval
 *  API'si Swiss turnirlarida HAR DOIM bo'sh float qaytarardi.
 *
 *  Auditda jonli tasdiqlangan: 11 o'yinchili 5 turli Swiss'da
 *  `farzin_pairing_float_count_sum` = 19, jadvaldagi 11 qatorning esa
 *  HAMMASIDA `floatHistory: []`.
 *
 *  prisma/schema.prisma bu maydonni "juftlashtirish uchun kerak" deb
 *  ta'riflaydi va u API'da tashqariga chiqadi — ya'ni noto'g'ri ma'lumot
 *  jimgina tarqalardi.
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * REAL PostgreSQL + Redis (Testcontainers) — docs/13-testing-strategy.md §3.
 */
describe('Jadval float tarixi (integration)', () => {
  let t: TestApp;

  beforeAll(async () => {
    t = await createTestApp();
  });

  afterAll(async () => {
    await t.close();
  });

  beforeEach(async () => {
    await resetState(t.prisma, t.redis);
  });

  /** Ro'yxatdan o'tish limitini (3/soat/IP) chetlab o'tish — mavzu bu emas. */
  async function clearRegisterLimit(): Promise<void> {
    const keys = await t.redis.keys('rl:register:*');
    if (keys.length > 0) {
      await t.redis.del(...keys);
    }
  }

  it("TOQ sonli Swiss seksiyada bye olgan o'yinchi DOWN float oladi", async () => {
    // --- Admin -----------------------------------------------------------
    const admin = await registerUser(t.server, { email: 'hakam@test.uz' });
    const adminToken = admin.body.accessToken as string;
    await grantRole(t.prisma, t.redis, userIdFromToken(adminToken), Role.SUPER_ADMIN);
    const auth = bearer(adminToken);

    // --- Federatsiya + turnir + seksiya ----------------------------------
    const fed = await request(t.server)
      .post('/api/v1/federations')
      .set(auth)
      .send({ name: 'Test federatsiyasi', shortName: 'TestFed', countryCode: 'UZB' });
    expect(fed.status).toBe(201);

    const tournament = await request(t.server)
      .post('/api/v1/tournaments')
      .set(auth)
      .send({
        name: 'Float sinovi',
        slug: 'float-sinovi',
        startDate: '2026-10-01T00:00:00.000Z',
        endDate: '2026-10-02T00:00:00.000Z',
        federationId: fed.body.id as string,
      });
    expect(tournament.status).toBe(201);
    const tournamentId = tournament.body.id as string;

    const section = await request(t.server)
      .post(`/api/v1/tournaments/${tournamentId}/sections`)
      .set(auth)
      .send({
        name: 'A',
        pairingSystem: 'SWISS_DUTCH',
        totalRounds: 2,
        timeCategory: 'CLASSICAL',
        clockType: 'FISCHER_INCREMENT',
        baseTimeSeconds: 5400,
        incrementSeconds: 30,
      });
    expect(section.status).toBe(201);
    const sectionId = section.body.id as string;

    // --- 5 o'yinchi (TOQ son → har turda aynan bitta bye) -----------------
    await request(t.server)
      .post(`/api/v1/tournaments/${tournamentId}/status`)
      .set(auth)
      .send({ status: 'REGISTRATION_OPEN' });

    for (let i = 0; i < 5; i += 1) {
      await clearRegisterLimit();
      const player = await registerUser(t.server, { email: `oyinchi${String(i)}@test.uz` });
      expect(player.status).toBe(201);
      const reg = await request(t.server)
        .post(`/api/v1/sections/${sectionId}/registrations`)
        .set(bearer(player.body.accessToken as string))
        .send({});
      expect(reg.status).toBe(201);
    }

    await request(t.server)
      .post(`/api/v1/tournaments/${tournamentId}/status`)
      .set(auth)
      .send({ status: 'REGISTRATION_CLOSED' });
    await request(t.server)
      .post(`/api/v1/tournaments/${tournamentId}/status`)
      .set(auth)
      .send({ status: 'IN_PROGRESS' });

    // --- 1-tur: juftliklar + natijalar + yopish ---------------------------
    const round = await request(t.server)
      .post(`/api/v1/sections/${sectionId}/rounds`)
      .set(auth)
      .send({});
    expect(round.status).toBe(201);

    const pairings = round.body.pairings as {
      id: string;
      whiteRegistrationId: string;
      blackRegistrationId: string | null;
      result: string;
    }[];

    // 5 o'yinchi → 2 juftlik + 1 bye.
    const games = pairings.filter((p) => p.blackRegistrationId !== null);
    const byes = pairings.filter((p) => p.blackRegistrationId === null);
    expect(games).toHaveLength(2);
    expect(byes).toHaveLength(1);

    // Bye avtomatik BYE_FULL — hakam natija kiritmaydi.
    expect(byes[0]!.result).toBe('BYE_FULL');
    const byeRegistrationId = byes[0]!.whiteRegistrationId;

    for (const game of games) {
      const res = await request(t.server)
        .patch(`/api/v1/pairings/${game.id}/result`)
        .set(auth)
        .send({ result: 'WHITE_WIN' });
      expect(res.status).toBe(200);
    }

    const completed = await request(t.server)
      .post(`/api/v1/rounds/${round.body.id as string}/complete`)
      .set(auth)
      .send({});
    expect(completed.status).toBe(200);

    // --- Jadval: float tarixi ---------------------------------------------
    const standings = await request(t.server)
      .get(`/api/v1/sections/${sectionId}/standings`)
      .set(auth);
    expect(standings.status).toBe(200);

    const rows = standings.body as { registrationId: string; floatHistory: string[] }[];
    expect(rows).toHaveLength(5);

    // ENG MUHIM da'vo: float tarixi endi bo'sh EMAS.
    // Tuzatishdan oldin bu yerda hamma qatorda [] chiqardi.
    for (const row of rows) {
      expect(row.floatHistory).toHaveLength(1); // 1 ta yakunlangan tur
    }

    // FIDE C.04.3 Article 1.4.3: to'liq ochkoli bye → DOWNFLOAT.
    const byeRow = rows.find((r) => r.registrationId === byeRegistrationId);
    expect(byeRow).toBeDefined();
    expect(byeRow!.floatHistory).toEqual(['DOWN']);

    // Taxtada o'ynagan 4 o'yinchi 1-turda teng ochkoda edi (hammasi 0) —
    // Article 1.4.4 bo'yicha ular float OLMAYDI.
    const played = rows.filter((r) => r.registrationId !== byeRegistrationId);
    for (const row of played) {
      expect(row.floatHistory).toEqual(['NONE']);
    }
  });
});
