import request from 'supertest';

import { createTestApp, type TestApp } from './app.harness';
import { bearer, grantRole, registerUser, resetState, userIdFromToken } from './helpers';

/**
 * Audit atomikligi — Faza 0 DoD: "Audit log yozuvi biznes o'zgarishi
 * bilan atomik (integration test)" (docs/14-roadmap.md).
 *
 * Sinov to'liq API oqimi orqali: federatsiya → viloyat → klub → turnir →
 * seksiya (ROUND_ROBIN, RAPID, 3 tur) → ro'yxat → tur generatsiyasi →
 * natija. Keyin uch da'vo:
 *
 *  1. natija kiritildi → `result.created` audit yozuvi BOR;
 *  2. SABABSIZ o'zgartirish → 422 RESULT_CHANGE_REASON_REQUIRED va DB'da
 *     HECH NARSA o'zgarmagan (natija ham, audit ham) — atomiklik;
 *  3. sabab bilan o'zgartirish → 200 va `result.updated` yozuvida sabab.
 *
 * Testlar KETMA-KET bitta oqim holatini bo'lishadi (jest fayl ichida
 * tartibni kafolatlaydi) — har biri oldingisining natijasiga tayanadi.
 */
describe('Audit atomikligi (integration)', () => {
  let t: TestApp;

  let adminToken: string;
  let player1Token: string;
  let player2Token: string;
  let tournamentId: string;
  let sectionId: string;
  let pairingId: string;

  beforeAll(async () => {
    t = await createTestApp();
    await resetState(t.prisma, t.redis);

    // ⚠️  Register limiti 3/soat IP (docs/10-security.md §7.1) — bu
    //     faylda AYNAN 3 foydalanuvchi yaratiladi, limit oshirilmaydi.
    const admin = await registerUser(t.server, { email: 'organizer@test.uz' });
    adminToken = admin.body.accessToken as string;
    await grantRole(t.prisma, t.redis, userIdFromToken(adminToken), 'SUPER_ADMIN');

    const p1 = await registerUser(t.server, {
      email: 'oyinchi1@test.uz',
      firstName: 'Alisher',
      lastName: 'Karimov',
    });
    player1Token = p1.body.accessToken as string;

    const p2 = await registerUser(t.server, {
      email: 'oyinchi2@test.uz',
      firstName: 'Bobur',
      lastName: 'Toshev',
    });
    player2Token = p2.body.accessToken as string;
  });

  afterAll(async () => {
    await t.close();
  });

  async function changeStatus(status: string): Promise<void> {
    const res = await request(t.server)
      .post(`/api/v1/tournaments/${tournamentId}/status`)
      .set(bearer(adminToken))
      .send({ status });
    expect(res.status).toBe(200);
    expect(res.body.status).toBe(status);
  }

  it("to'liq oqim: org → turnir → seksiya → ro'yxat → tur → natija (result.created audit bilan)", async () => {
    // --- Org ierarxiyasi (API orqali — audit yozuvlari bilan birga) ------
    const fed = await request(t.server)
      .post('/api/v1/federations')
      .set(bearer(adminToken))
      .send({ name: "O'zbekiston shaxmat federatsiyasi", shortName: 'UzChess', countryCode: 'UZB' });
    expect(fed.status).toBe(201);

    const region = await request(t.server)
      .post('/api/v1/regions')
      .set(bearer(adminToken))
      .send({ federationId: fed.body.id as string, name: 'Toshkent shahri' });
    expect(region.status).toBe(201);

    const club = await request(t.server)
      .post('/api/v1/clubs')
      .set(bearer(adminToken))
      .send({ regionId: region.body.id as string, name: 'Toshkent shaxmat klubi', slug: 'toshkent-klubi' });
    expect(club.status).toBe(201);

    // --- Turnir (DRAFT) + seksiya ----------------------------------------
    const tournament = await request(t.server)
      .post('/api/v1/tournaments')
      .set(bearer(adminToken))
      .send({
        name: 'Toshkent rapid 2026',
        slug: 'toshkent-rapid-2026',
        clubId: club.body.id as string,
        startDate: '2026-08-01T09:00:00.000+05:00',
        endDate: '2026-08-01T18:00:00.000+05:00',
      });
    expect(tournament.status).toBe(201);
    expect(tournament.body.status).toBe('DRAFT');
    tournamentId = tournament.body.id as string;

    const section = await request(t.server)
      .post(`/api/v1/tournaments/${tournamentId}/sections`)
      .set(bearer(adminToken))
      .send({
        name: 'A guruh',
        pairingSystem: 'ROUND_ROBIN',
        timeCategory: 'RAPID',
        totalRounds: 3,
        clockType: 'FISCHER_INCREMENT',
        baseTimeSeconds: 900,
        incrementSeconds: 10,
      });
    expect(section.status).toBe(201);
    sectionId = section.body.id as string;

    // --- Ro'yxat: ochish → 2 o'yinchi O'Z tokeni bilan → yopish → start --
    await changeStatus('REGISTRATION_OPEN');

    for (const token of [player1Token, player2Token]) {
      const reg = await request(t.server)
        .post(`/api/v1/sections/${sectionId}/registrations`)
        .set(bearer(token))
        .send({});
      expect(reg.status).toBe(201);
      // Bepul turnir → avtomatik tasdiq (tournament.service.ts).
      expect(reg.body.isConfirmed).toBe(true);
    }

    await changeStatus('REGISTRATION_CLOSED');
    await changeStatus('IN_PROGRESS');

    // --- Tur generatsiyasi (round-robin, 2 o'yinchi → 1 juftlik) ---------
    const round = await request(t.server)
      .post(`/api/v1/sections/${sectionId}/rounds`)
      .set(bearer(adminToken))
      .send();
    expect(round.status).toBe(201);
    expect(round.body.pairings).toHaveLength(1);
    pairingId = round.body.pairings[0].id as string;

    // --- Birinchi natija: sabab SHART EMAS --------------------------------
    const result = await request(t.server)
      .patch(`/api/v1/pairings/${pairingId}/result`)
      .set(bearer(adminToken))
      .send({ result: 'WHITE_WIN' });
    expect(result.status).toBe(200);
    expect(result.body.result).toBe('WHITE_WIN');

    // Audit: result.created — natija bilan BIR tranzaksiyada
    // (arbiter.repository.ts enterResult).
    const created = await t.prisma.auditLog.findMany({
      where: { action: 'result.created', resourceId: pairingId },
    });
    expect(created).toHaveLength(1);
  });

  it("SABABSIZ o'zgartirish → 422 va DB'da hech narsa o'zgarmagan (atomiklik)", async () => {
    const res = await request(t.server)
      .patch(`/api/v1/pairings/${pairingId}/result`)
      .set(bearer(adminToken))
      .send({ result: 'BLACK_WIN' });

    expect(res.status).toBe(422);
    expect(res.headers['content-type']).toContain('application/problem+json');
    expect(res.body.code).toBe('RESULT_CHANGE_REASON_REQUIRED');

    // Natija DB'da O'ZGARMAGAN — rad etilgan amal iz qoldirmaydi.
    const pairing = await t.prisma.pairing.findUniqueOrThrow({ where: { id: pairingId } });
    expect(pairing.result).toBe('WHITE_WIN');

    // Audit'da result.updated YO'Q — "natija saqlanib audit yozilmadi"
    // ham, aksi ham bo'lmasin (docs/15-observability.md §8).
    const updated = await t.prisma.auditLog.findMany({ where: { action: 'result.updated' } });
    expect(updated).toHaveLength(0);
  });

  it("sabab BILAN o'zgartirish → 200 va result.updated yozuvida sabab bor", async () => {
    const reason = "Hakam xatosi: taxta raqami adashib yozilgan edi";

    const res = await request(t.server)
      .patch(`/api/v1/pairings/${pairingId}/result`)
      .set(bearer(adminToken))
      .send({ result: 'BLACK_WIN', reason });
    expect(res.status).toBe(200);
    expect(res.body.result).toBe('BLACK_WIN');

    const pairing = await t.prisma.pairing.findUniqueOrThrow({ where: { id: pairingId } });
    expect(pairing.result).toBe('BLACK_WIN');

    // Sabab audit `after` JSON'ida (audit.service.ts mergeReason) —
    // "natija o'zgartirildi, nega?" savoliga javob doim bor.
    const updated = await t.prisma.auditLog.findMany({
      where: { action: 'result.updated', resourceId: pairingId },
    });
    expect(updated).toHaveLength(1);
    const after = updated[0]!.after as { reason?: string; result?: string };
    expect(after.reason).toBe(reason);
    expect(after.result).toBe('BLACK_WIN');

    // before ham saqlangan — nima nimaga o'zgargani ko'rinadi.
    const before = updated[0]!.before as { result?: string };
    expect(before.result).toBe('WHITE_WIN');
  });
});
