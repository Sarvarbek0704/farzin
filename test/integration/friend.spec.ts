import request from 'supertest';

import { createTestApp, type TestApp } from './app.harness';
import { bearer, expectProblem, registerUser, resetState, userIdFromToken } from './helpers';

/**
 * Do'stlar moduli — to'liq API oqimi.
 *
 * ═══════════════════════════════════════════════════════════════════════════
 *  BU SUITE NIMANI QO'RIQLAYDI
 *
 *  Qoidalar `friendship.rules.spec.ts` da (sof, DB'siz) allaqachon
 *  tekshirilgan. Bu yerda ULAR EMAS, ULARNING SIMLANISHI sinaladi:
 *
 *   - qoida qarori HTTP statusiga to'g'ri aylanadimi (422 va 404 farqi);
 *   - a'zo bo'lmagan odam 404 oladimi (403 emas — qator borligi
 *     oshkor bo'lmasin, docs/04-api-spec.md §2.4);
 *   - DB cheklovlari (juftlik unikal indeksi, `blocked_by` mosligi)
 *     haqiqiy yozuvda ushlanadimi;
 *   - har o'zgarish audit'ga tushadimi.
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * ⚠️  Register limiti 3/soat IP (docs/10-security.md §7.1) — shuning
 *     uchun har ro'yxatdan o'tish oldidan Redis tozalanadi. DB
 *     TRUNCATE QILINMAYDI: uch foydalanuvchi butun suite davomida
 *     yashaydi.
 */
describe('Friends (integration)', () => {
  let t: TestApp;

  /** A — so'rov yuboruvchi; B — qabul qiluvchi; C — begona (uchinchi shaxs). */
  let tokenA: string;
  let tokenB: string;
  let tokenC: string;
  let playerA: string;
  let playerB: string;
  let playerC: string;

  const api = (path: string): string => `/api/v1${path}`;

  beforeAll(async () => {
    t = await createTestApp();
    await resetState(t.prisma, t.redis);

    [tokenA, playerA] = await createPlayer('friend-a@test.uz');
    [tokenB, playerB] = await createPlayer('friend-b@test.uz');
    [tokenC, playerC] = await createPlayer('friend-c@test.uz');
  });

  afterAll(async () => {
    await t.close();
  });

  /** Ro'yxatdan o'tkazish + o'yinchi ID'sini olish. */
  async function createPlayer(email: string): Promise<[token: string, playerId: string]> {
    // IP limitini tozalaymiz — testlar soni limitdan oshmasin.
    await t.redis.flushall();
    const res = await registerUser(t.server, { email });
    expect(res.status).toBe(201);
    const token = res.body.accessToken as string;
    const player = await t.prisma.player.findFirstOrThrow({
      where: { userId: userIdFromToken(token) },
      select: { id: true },
    });
    return [token, player.id];
  }

  async function auditActions(resourceId: string): Promise<string[]> {
    const rows = await t.prisma.auditLog.findMany({
      where: { resourceType: 'Friendship', resourceId },
      orderBy: { createdAt: 'asc' },
      select: { action: true },
    });
    return rows.map((r) => r.action);
  }

  // --- So'rov yuborish ---------------------------------------------------------

  describe("so'rov yuborish", () => {
    let friendshipId: string;

    it('A → B: so`rov yaratiladi', async () => {
      const res = await request(t.server)
        .post(api('/friends'))
        .set(bearer(tokenA))
        .send({ playerId: playerB });

      expect(res.status).toBe(201);
      expect(typeof res.body.id).toBe('string');
      friendshipId = res.body.id as string;
    });

    it('B uchun bu KELGAN so`rov, A uchun YUBORILGAN', async () => {
      const forB = await request(t.server).get(api('/friends/requests')).set(bearer(tokenB));
      expect(forB.status).toBe(200);
      expect(forB.body).toHaveLength(1);
      expect(forB.body[0]).toMatchObject({
        friendshipId,
        otherPlayerId: playerA,
        outgoing: false,
        status: 'PENDING',
      });
      // Ism PLAYER_PORT orqali qo'shiladi — repository uni bilmaydi.
      expect(typeof forB.body[0].firstName).toBe('string');

      const forA = await request(t.server).get(api('/friends/requests')).set(bearer(tokenA));
      expect(forA.body[0]).toMatchObject({ otherPlayerId: playerB, outgoing: true });
    });

    it("qabul qilinmaguncha do'stlar ro'yxati BO'SH", async () => {
      const res = await request(t.server).get(api('/friends')).set(bearer(tokenA));
      expect(res.status).toBe(200);
      expect(res.body).toEqual([]);
    });

    it('takror so`rov — 422 REQUEST_PENDING', async () => {
      const res = await request(t.server)
        .post(api('/friends'))
        .set(bearer(tokenA))
        .send({ playerId: playerB });
      expectProblem(res, 422, 'REQUEST_PENDING');
    });

    it("teskari yo'nalishdagi so'rov — 422 INCOMING_REQUEST_PENDING (yangi qator EMAS)", async () => {
      // Juftlik unikal indeksi buni baribir to'xtatardi, lekin
      // foydalanuvchiga "qabul qiling" deb aytish MUHIM.
      const res = await request(t.server)
        .post(api('/friends'))
        .set(bearer(tokenB))
        .send({ playerId: playerA });
      expectProblem(res, 422, 'INCOMING_REQUEST_PENDING');
    });

    it("o'ziga so'rov — 422 SELF_FRIENDSHIP", async () => {
      const res = await request(t.server)
        .post(api('/friends'))
        .set(bearer(tokenA))
        .send({ playerId: playerA });
      expectProblem(res, 422, 'SELF_FRIENDSHIP');
    });

    it("mavjud bo'lmagan o'yinchi — 404", async () => {
      const res = await request(t.server)
        .post(api('/friends'))
        .set(bearer(tokenA))
        .send({ playerId: '00000000-0000-4000-8000-000000000000' });
      expectProblem(res, 404, 'NOT_FOUND');
    });

    it("SO'ROVCHI o'z so'rovini QABUL QILA OLMAYDI — 422", async () => {
      const res = await request(t.server)
        .post(api(`/friends/${friendshipId}/accept`))
        .set(bearer(tokenA));
      expectProblem(res, 422, 'NOT_ADDRESSEE');
    });

    it("BEGONA odam uchun so'rov MAVJUD EMAS — 422 emas, 404", async () => {
      // Farq muhim: 422 "bor, lekin ruxsat yo'q" degani bo'lardi.
      const res = await request(t.server)
        .post(api(`/friends/${friendshipId}/accept`))
        .set(bearer(tokenC));
      expectProblem(res, 404, 'NOT_FOUND');
    });

    it("token'siz — 401", async () => {
      const res = await request(t.server).get(api('/friends'));
      expect(res.status).toBe(401);
    });

    it('B qabul qiladi — ikkalasi ham ro`yxatda', async () => {
      const res = await request(t.server)
        .post(api(`/friends/${friendshipId}/accept`))
        .set(bearer(tokenB));
      expect(res.status).toBe(204);

      const forA = await request(t.server).get(api('/friends')).set(bearer(tokenA));
      expect(forA.body).toHaveLength(1);
      expect(forA.body[0]).toMatchObject({ otherPlayerId: playerB, status: 'ACCEPTED' });

      const forB = await request(t.server).get(api('/friends')).set(bearer(tokenB));
      expect(forB.body[0]).toMatchObject({ otherPlayerId: playerA, status: 'ACCEPTED' });

      // Kutilayotganlar ro'yxati bo'shadi.
      const pending = await request(t.server).get(api('/friends/requests')).set(bearer(tokenB));
      expect(pending.body).toEqual([]);
    });

    it('takror qabul — 422 NOT_PENDING', async () => {
      const res = await request(t.server)
        .post(api(`/friends/${friendshipId}/accept`))
        .set(bearer(tokenB));
      expectProblem(res, 422, 'NOT_PENDING');
    });

    it("do'st bo'lgandan keyin yangi so'rov — 422 ALREADY_FRIENDS", async () => {
      const res = await request(t.server)
        .post(api('/friends'))
        .set(bearer(tokenA))
        .send({ playerId: playerB });
      expectProblem(res, 422, 'ALREADY_FRIENDS');
    });

    it("BEGONA odam do'stlikni buza olmaydi — 404", async () => {
      const res = await request(t.server)
        .delete(api(`/friends/${friendshipId}`))
        .set(bearer(tokenC));
      expectProblem(res, 404, 'NOT_FOUND');
    });

    it("audit zanjiri: so'rov → qabul", async () => {
      expect(await auditActions(friendshipId)).toEqual(['friend.request', 'friend.accept']);
    });

    it("do'stlikdan chiqarish — ikkala ro'yxat ham bo'shaydi", async () => {
      const res = await request(t.server)
        .delete(api(`/friends/${friendshipId}`))
        .set(bearer(tokenB));
      expect(res.status).toBe(204);

      const forA = await request(t.server).get(api('/friends')).set(bearer(tokenA));
      expect(forA.body).toEqual([]);
      const forB = await request(t.server).get(api('/friends')).set(bearer(tokenB));
      expect(forB.body).toEqual([]);

      // Qator o'chsa ham audit QOLADI (append-only jadval).
      expect(await auditActions(friendshipId)).toEqual([
        'friend.request',
        'friend.accept',
        'friend.remove',
      ]);
    });
  });

  // --- Rad etish ---------------------------------------------------------------

  describe("so'rovni rad etish", () => {
    it("rad etish 'friend.decline' deb yoziladi — 'remove' emas", async () => {
      const created = await request(t.server)
        .post(api('/friends'))
        .set(bearer(tokenA))
        .send({ playerId: playerC });
      expect(created.status).toBe(201);
      const id = created.body.id as string;

      const res = await request(t.server)
        .delete(api(`/friends/${id}`))
        .set(bearer(tokenC));
      expect(res.status).toBe(204);

      expect(await auditActions(id)).toEqual(['friend.request', 'friend.decline']);
    });

    it("so'rovchi O'Z so'rovini qaytarib ola oladi", async () => {
      const created = await request(t.server)
        .post(api('/friends'))
        .set(bearer(tokenA))
        .send({ playerId: playerC });
      const id = created.body.id as string;

      const res = await request(t.server)
        .delete(api(`/friends/${id}`))
        .set(bearer(tokenA));
      expect(res.status).toBe(204);

      // Rad etilgan so'rov QATOR QOLDIRMAYDI — shuning uchun qayta
      // yuborish mumkin (DECLINED holati sxemada ataylab yo'q).
      const again = await request(t.server)
        .post(api('/friends'))
        .set(bearer(tokenA))
        .send({ playerId: playerC });
      expect(again.status).toBe(201);

      await request(t.server)
        .delete(api(`/friends/${again.body.id as string}`))
        .set(bearer(tokenA));
    });
  });

  // --- Bloklash ----------------------------------------------------------------

  describe('bloklash', () => {
    let blockId: string;

    it("do'st bo'lmagan odamni ham bloklash mumkin", async () => {
      const res = await request(t.server)
        .post(api('/friends/blocks'))
        .set(bearer(tokenA))
        .send({ playerId: playerB });
      expect(res.status).toBe(201);
      blockId = res.body.id as string;
    });

    it('bloklangan odam so`rov yubora olmaydi — 422 BLOCKED', async () => {
      const res = await request(t.server)
        .post(api('/friends'))
        .set(bearer(tokenB))
        .send({ playerId: playerA });
      expectProblem(res, 422, 'BLOCKED');
    });

    it('BLOKLAGAN odam ham shu javobni oladi — kim bloklagani BILINMAYDI', async () => {
      const res = await request(t.server)
        .post(api('/friends'))
        .set(bearer(tokenA))
        .send({ playerId: playerB });
      expectProblem(res, 422, 'BLOCKED');
    });

    it("blok ro'yxati FAQAT bloklaganda ko'rinadi", async () => {
      const mine = await request(t.server).get(api('/friends/blocks')).set(bearer(tokenA));
      expect(mine.body).toHaveLength(1);
      expect(mine.body[0]).toMatchObject({ otherPlayerId: playerB });

      // B "meni kim bloklagan" ro'yxatini KO'RMAYDI.
      const theirs = await request(t.server).get(api('/friends/blocks')).set(bearer(tokenB));
      expect(theirs.body).toEqual([]);
    });

    it("blokni 'do'stlikdan chiqarish' bilan ochib bo'lmaydi — 422 BLOCKED", async () => {
      const res = await request(t.server)
        .delete(api(`/friends/${blockId}`))
        .set(bearer(tokenB));
      expectProblem(res, 422, 'BLOCKED');
    });

    it('BLOKLANGAN odam blokni ocha olmaydi — 422 NOT_BLOCKER', async () => {
      const res = await request(t.server)
        .delete(api(`/friends/blocks/${blockId}`))
        .set(bearer(tokenB));
      expectProblem(res, 422, 'NOT_BLOCKER');
    });

    it('begona odam uchun blok mavjud emas — 404', async () => {
      const res = await request(t.server)
        .delete(api(`/friends/blocks/${blockId}`))
        .set(bearer(tokenC));
      expectProblem(res, 404, 'NOT_FOUND');
    });

    it("o'zini bloklab bo'lmaydi — 422 SELF_FRIENDSHIP", async () => {
      const res = await request(t.server)
        .post(api('/friends/blocks'))
        .set(bearer(tokenA))
        .send({ playerId: playerA });
      expectProblem(res, 422, 'SELF_FRIENDSHIP');
    });

    it('bloklagan odam ochadi — juftlik yana ochiladi', async () => {
      const res = await request(t.server)
        .delete(api(`/friends/blocks/${blockId}`))
        .set(bearer(tokenA));
      expect(res.status).toBe(204);

      expect(await auditActions(blockId)).toEqual(['friend.block', 'friend.unblock']);

      const again = await request(t.server)
        .post(api('/friends'))
        .set(bearer(tokenB))
        .send({ playerId: playerA });
      expect(again.status).toBe(201);
    });
  });

  // --- O'yinchi qidiruvi (do'st qo'shish uchun) ---------------------------------

  describe("o'yinchi qidiruvi", () => {
    it('familiya bo`yicha topadi', async () => {
      const res = await request(t.server).get(api('/players?first=10&q=Sodiqov'));
      expect(res.status).toBe(200);
      // Uchala test foydalanuvchisi ham `helpers.ts` dagi standart
      // ism bilan yaratiladi — ya'ni uchalasi ham topilishi kerak.
      expect(res.body.items.length).toBeGreaterThanOrEqual(3);
    });

    it("mos kelmagan so'rov — bo'sh ro'yxat, xato emas", async () => {
      const res = await request(t.server).get(api('/players?first=10&q=Zzzqqq'));
      expect(res.status).toBe(200);
      expect(res.body.items).toEqual([]);
    });

    it('bitta harf — 400 (ro`yxatni butunlay yuklab olishning oldi olinadi)', async () => {
      const res = await request(t.server).get(api('/players?first=10&q=S'));
      expect(res.status).toBe(400);
    });

    it("ommaviy javobda `userId` YO'Q", async () => {
      // Hisob ID'si (JWT `sub`) ommaviy sirtda kerak emas —
      // player.service.ts `toPublic` izohiga qarang.
      const list = await request(t.server).get(api('/players?first=5'));
      expect(list.status).toBe(200);
      expect(list.body.items.length).toBeGreaterThan(0);
      for (const item of list.body.items) {
        expect(item).not.toHaveProperty('userId');
      }

      const one = await request(t.server).get(api(`/players/${playerA}`));
      expect(one.status).toBe(200);
      expect(one.body).not.toHaveProperty('userId');
      expect(one.body.id).toBe(playerA);
    });
  });

  // --- Validatsiya -------------------------------------------------------------

  it("playerId UUID bo'lmasa — 400 (RFC 9457)", async () => {
    const res = await request(t.server)
      .post(api('/friends'))
      .set(bearer(tokenA))
      .send({ playerId: 'not-a-uuid' });
    expect(res.status).toBe(400);
    expect(res.headers['content-type']).toContain('application/problem+json');
  });
});
