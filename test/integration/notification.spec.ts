import request from 'supertest';

import { OutboxPublisher } from '../../src/shared/outbox/outbox.publisher';
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
 * Notification moduli — outbox'dan API'gacha to'liq halqa.
 *
 * Oqim (audit-atomicity.spec.ts pattern'i): org → turnir → seksiya
 * (ROUND_ROBIN, 2 o'yinchi) → ro'yxat → tur → natija → TUR YAKUNI.
 * Keyin da'volar:
 *
 *  1. outbox `RoundCompleted` PUBLISHED bo'lgach ikkala o'yinchida
 *     `round.completed` IN_APP qatori bor (sentAt bilan); EMAIL qatori
 *     YO'Q — harness'da SMTP ataylab o'chiq (app.harness.ts, SMTP yo'li
 *     email.channel.spec.ts jsonTransport bilan qoplangan);
 *  2. IDEMPOTENTLIK (ADR-0008 at-least-once simulyatsiyasi): event
 *     PENDING'ga qaytarilib QAYTA publish qilinadi → dublikat qator YO'Q;
 *  3. API: ro'yxat/unread-count/read/read-all faqat O'Z xabarlari ustida,
 *     boshqa userning xabari → 404 (IDOR, docs/04 §2.4).
 *
 * PUBLISHER HAQIDA: harness to'liq AppModule ko'taradi — OutboxPublisher
 * @Interval(500ms) poller'i jest ostida HAM ishlaydi (ScheduleModule
 * app.init'da start bo'ladi). Determinizm uchun testlar kutish o'rniga
 * poll()'ni TO'G'RIDAN-TO'G'RI ham chaqiradi — advisory lock tufayli
 * interval bilan to'qnashuv xavfsiz (bittasi ishlaydi, ikkinchisi tick
 * o'tkazadi), shuning uchun chaqiruvdan keyin DB holatini kutish sikli bor.
 *
 * ⚠️  Register limiti 3/soat IP (docs/10-security.md §7.1) — bu faylda
 *     AYNAN 3 foydalanuvchi yaratiladi.
 */
describe('Notification (integration)', () => {
  let t: TestApp;

  let adminToken: string;
  let player1Token: string;
  let player2Token: string;
  let player1Id: string;
  let player2Id: string;
  let tournamentId: string;
  let sectionId: string;
  let roundEventId: string;

  /** poll()'ni turtib, shartni kutish (interval poller bilan poygasiz). */
  async function waitFor(condition: () => Promise<boolean>, label: string): Promise<void> {
    const deadline = Date.now() + 15_000;
    for (;;) {
      await t.app.get(OutboxPublisher).poll();
      if (await condition()) {
        return;
      }
      if (Date.now() > deadline) {
        throw new Error(`Kutish tugadi: ${label}`);
      }
      await new Promise((resolve) => setTimeout(resolve, 100));
    }
  }

  beforeAll(async () => {
    t = await createTestApp();
    await resetState(t.prisma, t.redis);

    const admin = await registerUser(t.server, { email: 'organizer@test.uz' });
    adminToken = admin.body.accessToken as string;
    await grantRole(t.prisma, t.redis, userIdFromToken(adminToken), 'SUPER_ADMIN');

    const p1 = await registerUser(t.server, {
      email: 'oyinchi1@test.uz',
      firstName: 'Alisher',
      lastName: 'Karimov',
    });
    player1Token = p1.body.accessToken as string;
    player1Id = userIdFromToken(player1Token);

    const p2 = await registerUser(t.server, {
      email: 'oyinchi2@test.uz',
      firstName: 'Bobur',
      lastName: 'Toshev',
    });
    player2Token = p2.body.accessToken as string;
    player2Id = userIdFromToken(player2Token);
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
  }

  it("to'liq halqa: tur yakuni → outbox → ikkala o'yinchiga IN_APP 'round.completed'", async () => {
    // --- Mini turnir oqimi (audit-atomicity.spec.ts bilan bir xil) --------
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

    await changeStatus('REGISTRATION_OPEN');
    for (const token of [player1Token, player2Token]) {
      const reg = await request(t.server)
        .post(`/api/v1/sections/${sectionId}/registrations`)
        .set(bearer(token))
        .send({});
      expect(reg.status).toBe(201);
      expect(reg.body.isConfirmed).toBe(true);
    }
    await changeStatus('REGISTRATION_CLOSED');
    await changeStatus('IN_PROGRESS');

    const round = await request(t.server)
      .post(`/api/v1/sections/${sectionId}/rounds`)
      .set(bearer(adminToken))
      .send();
    expect(round.status).toBe(201);
    const roundId = round.body.id as string;
    const pairingId = round.body.pairings[0].id as string;

    const result = await request(t.server)
      .patch(`/api/v1/pairings/${pairingId}/result`)
      .set(bearer(adminToken))
      .send({ result: 'WHITE_WIN' });
    expect(result.status).toBe(200);

    // --- Tur yakuni → outbox RoundCompleted (arbiter.repository.ts) ------
    const complete = await request(t.server)
      .post(`/api/v1/rounds/${roundId}/complete`)
      .set(bearer(adminToken))
      .send();
    expect(complete.status).toBe(200);

    const event = await t.prisma.outboxEvent.findFirstOrThrow({
      where: { eventType: 'RoundCompleted', aggregateId: roundId },
    });
    roundEventId = event.id;

    // --- Publisher halqasi: PENDING → PUBLISHED (poll + kutish) ----------
    await waitFor(async () => {
      const row = await t.prisma.outboxEvent.findUniqueOrThrow({ where: { id: roundEventId } });
      return row.status === 'PUBLISHED';
    }, 'RoundCompleted PUBLISHED');

    // --- Xabar qatorlari: ikkala o'yinchi, IN_APP, sentAt bor -------------
    const rows = await t.prisma.notification.findMany({
      where: { templateKey: 'round.completed' },
      orderBy: { id: 'asc' },
    });
    expect(rows).toHaveLength(2);
    expect(new Set(rows.map((r) => r.userId))).toEqual(new Set([player1Id, player2Id]));
    for (const row of rows) {
      expect(row.channel).toBe('IN_APP'); // EMAIL yo'q — SMTP harness'da o'chiq
      expect(row.sentAt).not.toBeNull(); // IN_APP: qator = yetkazish
      expect(row.readAt).toBeNull();
      expect(row.failedAt).toBeNull();
      const payload = row.payload as Record<string, unknown>;
      expect(payload.eventId).toBe(roundEventId); // dedupe kaliti payload'da
      expect(payload.roundNumber).toBe(1);
      expect(payload.sectionName).toBe('A guruh');
      expect(payload.tournamentName).toBe('Toshkent rapid 2026');
    }

    // Tashkilotchi o'yinchi EMAS — unga xabar YO'Q.
    const adminRows = await t.prisma.notification.count({
      where: { userId: userIdFromToken(adminToken) },
    });
    expect(adminRows).toBe(0);
  });

  it('idempotentlik: xuddi shu event QAYTA publish qilinsa dublikat qator chiqmaydi', async () => {
    // At-least-once simulyatsiyasi (ADR-0008): worker PUBLISHED deb
    // belgilashdan oldin yiqilgan — event PENDING'ga qaytadi.
    await t.prisma.outboxEvent.update({
      where: { id: roundEventId },
      data: { status: 'PENDING', availableAt: new Date() },
    });

    await waitFor(async () => {
      const row = await t.prisma.outboxEvent.findUniqueOrThrow({ where: { id: roundEventId } });
      return row.status === 'PUBLISHED';
    }, 'RoundCompleted QAYTA PUBLISHED');

    // Dedupe (eventId, userId, templateKey) ishladi — baribir 2 qator.
    const count = await t.prisma.notification.count({
      where: { templateKey: 'round.completed' },
    });
    expect(count).toBe(2);
  });

  it("API: o'z ro'yxati, unread-count, mark-read — faqat o'ziniki", async () => {
    // Ro'yxat — p1 faqat O'Z xabarini ko'radi.
    const list = await request(t.server)
      .get('/api/v1/notifications')
      .set(bearer(player1Token));
    expect(list.status).toBe(200);
    expect(list.body.items).toHaveLength(1);
    const item = list.body.items[0] as Record<string, unknown>;
    expect(item.templateKey).toBe('round.completed');
    expect(item.readAt).toBeNull();
    const notificationId = item.id as string;

    // Badge.
    const unread = await request(t.server)
      .get('/api/v1/notifications/unread-count')
      .set(bearer(player1Token));
    expect(unread.status).toBe(200);
    expect(unread.body.count).toBe(1);

    // ?unread=true filtri.
    const unreadList = await request(t.server)
      .get('/api/v1/notifications?unread=true')
      .set(bearer(player1Token));
    expect(unreadList.body.items).toHaveLength(1);

    // O'qildi — idempotent (ikkinchi chaqiruv ham 200).
    const read = await request(t.server)
      .post(`/api/v1/notifications/${notificationId}/read`)
      .set(bearer(player1Token));
    expect(read.status).toBe(200);
    expect(read.body.readAt).not.toBeNull();

    const readAgain = await request(t.server)
      .post(`/api/v1/notifications/${notificationId}/read`)
      .set(bearer(player1Token));
    expect(readAgain.status).toBe(200);

    // Endi o'qilmagan yo'q.
    const afterRead = await request(t.server)
      .get('/api/v1/notifications?unread=true')
      .set(bearer(player1Token));
    expect(afterRead.body.items).toHaveLength(0);
    const unreadAfter = await request(t.server)
      .get('/api/v1/notifications/unread-count')
      .set(bearer(player1Token));
    expect(unreadAfter.body.count).toBe(0);
  });

  it("IDOR: boshqa userning xabari → 404 (403 emas)", async () => {
    const p2List = await request(t.server)
      .get('/api/v1/notifications')
      .set(bearer(player2Token));
    const p2NotificationId = p2List.body.items[0].id as string;

    // p1 p2'ning xabarini o'qilgan qilolmaydi — resurs "mavjud emas".
    const res = await request(t.server)
      .post(`/api/v1/notifications/${p2NotificationId}/read`)
      .set(bearer(player1Token));
    expectProblem(res, 404, 'NOT_FOUND');

    // p2'niki o'zida o'qilmagan qoldi.
    const p2Unread = await request(t.server)
      .get('/api/v1/notifications/unread-count')
      .set(bearer(player2Token));
    expect(p2Unread.body.count).toBe(1);
  });

  it("read-all: p2 hammasini o'qidi; token'siz so'rov 401", async () => {
    const readAll = await request(t.server)
      .post('/api/v1/notifications/read-all')
      .set(bearer(player2Token));
    expect(readAll.status).toBe(200);
    expect(readAll.body.updated).toBe(1);

    const unread = await request(t.server)
      .get('/api/v1/notifications/unread-count')
      .set(bearer(player2Token));
    expect(unread.body.count).toBe(0);

    // Default yopiq (app.module.ts JwtAuthGuard) — token'siz 401.
    const anonymous = await request(t.server).get('/api/v1/notifications');
    expect(anonymous.status).toBe(401);
  });
});
