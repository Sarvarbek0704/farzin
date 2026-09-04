import request from 'supertest';

import { createTestApp, type TestApp } from './app.harness';
import {
  bearer,
  expectProblem,
  grantRole,
  loginUser,
  registerUser,
  resetState,
  userIdFromToken,
} from './helpers';

/**
 * Superadmin — foydalanuvchi va ROL boshqaruvi.
 *
 * ═══════════════════════════════════════════════════════════════════════════
 *  BU SUITE NIMANI QO'RIQLAYDI
 *
 *  Delegatsiya qoidalari `role-grant.rules.spec.ts` da (sof, 21 test).
 *  Bu yerda ULARNING SIMLANISHI: qaror HTTP statusiga to'g'ri
 *  aylanadimi, rol HAQIQATAN kuchga kiradimi (authz keshi bilan),
 *  bloklangan odam sessiyasidan ayriladimi va har o'zgarish audit'ga
 *  tushadimi.
 *
 *  Eng muhim da'vo: **RUXSATSIZ ODAM UCHUN BU ENDPOINTLAR MAVJUD
 *  EMAS** — 403 emas, 404 (docs/04-api-spec.md §2.4).
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * ⚠️  Register limiti 3/soat IP — har ro'yxatdan o'tish oldidan Redis
 *     tozalanadi (DB emas: foydalanuvchilar suite davomida yashaydi).
 */
describe('Superadmin (integration)', () => {
  let t: TestApp;

  let adminToken: string;
  let adminUserId: string;
  /** Oddiy o'yinchi — hech qanday ma'muriy huquqsiz. */
  let plainToken: string;
  let plainUserId: string;
  /** Uchinchi hisob — unga rol beriladi va olib tashlanadi. */
  let targetUserId: string;

  const api = (path: string): string => `/api/v1${path}`;
  const REASON = 'Turnir hakami sifatida tayinlandi — 2026 yil bahorgi chempionat';

  beforeAll(async () => {
    t = await createTestApp();
    await resetState(t.prisma, t.redis);

    adminToken = await createUser('admin@test.uz');
    adminUserId = userIdFromToken(adminToken);
    // Birinchi superadmin — DB orqali (haqiqiy deploy'da
    // `src/tools/grant-role.ts` shu ishni qiladi).
    await grantRole(t.prisma, t.redis, adminUserId, 'SUPER_ADMIN');

    plainToken = await createUser('oddiy@test.uz');
    plainUserId = userIdFromToken(plainToken);

    const targetToken = await createUser('maqsad@test.uz');
    targetUserId = userIdFromToken(targetToken);
  });

  afterAll(async () => {
    await t.close();
  });

  async function createUser(email: string): Promise<string> {
    await t.redis.flushall();
    const res = await registerUser(t.server, { email });
    expect(res.status).toBe(201);
    return res.body.accessToken as string;
  }

  async function auditActions(resourceId: string): Promise<string[]> {
    const rows = await t.prisma.auditLog.findMany({
      where: { resourceId },
      orderBy: { createdAt: 'asc' },
      select: { action: true },
    });
    return rows.map((r) => r.action);
  }

  // --- Kirish huquqi -----------------------------------------------------------

  describe('kirish huquqi', () => {
    it("token'siz — 401", async () => {
      const res = await request(t.server).get(api('/admin/users'));
      expect(res.status).toBe(401);
    });

    it('ODDIY foydalanuvchi uchun endpoint MAVJUD EMAS — 404, 403 emas', async () => {
      // Farq muhim: 403 "bor, lekin ruxsat yo'q" degan ma'lumot berardi.
      const res = await request(t.server).get(api('/admin/users')).set(bearer(plainToken));
      expectProblem(res, 404, 'NOT_FOUND');
    });

    it('oddiy foydalanuvchi rol ham bera olmaydi — 404', async () => {
      const res = await request(t.server)
        .post(api(`/admin/users/${targetUserId}/roles`))
        .set(bearer(plainToken))
        .send({ role: 'SUPER_ADMIN', reason: REASON });
      expectProblem(res, 404, 'NOT_FOUND');
    });

    it('superadmin ro`yxatni ko`radi', async () => {
      const res = await request(t.server).get(api('/admin/users')).set(bearer(adminToken));
      expect(res.status).toBe(200);
      expect(res.body.items.length).toBeGreaterThanOrEqual(3);
      // Har qatorda rollari ham keladi — panel uchun ikkinchi so'rov kerak emas.
      expect(Array.isArray(res.body.items[0].roles)).toBe(true);
    });

    it('qidiruv email bo`yicha ishlaydi', async () => {
      const res = await request(t.server)
        .get(api('/admin/users?search=oddiy@test.uz'))
        .set(bearer(adminToken));
      expect(res.status).toBe(200);
      expect(res.body.items).toHaveLength(1);
      expect(res.body.items[0].id).toBe(plainUserId);
    });

    it('rol bo`yicha filtr', async () => {
      const res = await request(t.server)
        .get(api('/admin/users?role=SUPER_ADMIN'))
        .set(bearer(adminToken));
      expect(res.status).toBe(200);
      expect(res.body.items).toHaveLength(1);
      expect(res.body.items[0].id).toBe(adminUserId);
    });

    it('platforma xulosasi', async () => {
      const res = await request(t.server).get(api('/admin/users/stats')).set(bearer(adminToken));
      expect(res.status).toBe(200);
      expect(res.body.users).toBeGreaterThanOrEqual(3);
      expect(typeof res.body.activeGames).toBe('number');
    });
  });

  // --- Rol berish --------------------------------------------------------------

  describe('rol berish', () => {
    let assignmentId: string;

    it('SABAB majburiy — qisqa sabab 400', async () => {
      const res = await request(t.server)
        .post(api(`/admin/users/${targetUserId}/roles`))
        .set(bearer(adminToken))
        .send({ role: 'ARBITER', reason: 'ok' });
      expect(res.status).toBe(400);
    });

    it('qamrov TALAB QILADIGAN rol qamrovsiz berilmaydi', async () => {
      // CLUB_ADMIN global berilsa u BARCHA klublarning admini bo'lardi.
      const res = await request(t.server)
        .post(api(`/admin/users/${targetUserId}/roles`))
        .set(bearer(adminToken))
        .send({ role: 'CLUB_ADMIN', reason: REASON });
      expectProblem(res, 422, 'SCOPE_REQUIRED');
    });

    it('global rolga qamrov berilmaydi', async () => {
      const res = await request(t.server)
        .post(api(`/admin/users/${targetUserId}/roles`))
        .set(bearer(adminToken))
        .send({
          role: 'SUPER_ADMIN',
          scopeType: 'CLUB',
          scopeId: '00000000-0000-4000-8000-000000000001',
          reason: REASON,
        });
      expectProblem(res, 422, 'SCOPE_NOT_ALLOWED');
    });

    it('ARBITER roli beriladi', async () => {
      const res = await request(t.server)
        .post(api(`/admin/users/${targetUserId}/roles`))
        .set(bearer(adminToken))
        .send({ role: 'ARBITER', reason: REASON });
      expect(res.status).toBe(201);
      expect(res.body.role).toBe('ARBITER');
      assignmentId = res.body.id as string;
    });

    it('takroriy rol — 422, DB cheklovi xatosi emas', async () => {
      const res = await request(t.server)
        .post(api(`/admin/users/${targetUserId}/roles`))
        .set(bearer(adminToken))
        .send({ role: 'ARBITER', reason: REASON });
      expectProblem(res, 422, 'ROLE_ALREADY_GRANTED');
    });

    it('audit`da sabab bilan yozilgan', async () => {
      expect(await auditActions(assignmentId)).toContain('role.granted');
      const row = await t.prisma.auditLog.findFirstOrThrow({
        where: { resourceId: assignmentId, action: 'role.granted' },
      });
      expect(row.actorUserId).toBe(adminUserId);
      // Sabab audit yozuvida SAQLANADI — keyin tekshirib bo'ladi.
      expect(JSON.stringify(row.after)).toContain('hakami');
    });

    it('rol HAQIQATAN kuchga kiradi — kesh tozalangan', async () => {
      // Bu eng oson unutiladigan qadam: `AuthzService` rollarni 60s
      // keshlaydi. Tozalanmasa yangi rol bir daqiqagacha ishlamasdi.
      const assignments = await t.prisma.userRole.findMany({ where: { userId: targetUserId } });
      expect(assignments).toHaveLength(1);
      expect(await t.redis.get(`authz:roles:${targetUserId}`)).toBeNull();
    });

    it("mavjud bo'lmagan foydalanuvchi — 404", async () => {
      const res = await request(t.server)
        .post(api('/admin/users/00000000-0000-4000-8000-000000000000/roles'))
        .set(bearer(adminToken))
        .send({ role: 'ARBITER', reason: REASON });
      expectProblem(res, 404, 'NOT_FOUND');
    });

    it('rol olib tashlanadi va audit`da qoladi', async () => {
      const res = await request(t.server)
        .delete(api(`/admin/users/roles/${assignmentId}`))
        .set(bearer(adminToken))
        .send({ reason: 'Turnir yakunlandi, hakamlik muddati tugadi' });
      expect(res.status).toBe(204);

      expect(await t.prisma.userRole.count({ where: { id: assignmentId } })).toBe(0);
      // Qator o'chdi, IZ qoldi.
      expect(await auditActions(assignmentId)).toEqual(['role.granted', 'role.revoked']);
    });
  });

  // --- Qulflanish himoyasi -----------------------------------------------------

  describe('qulflanib qolishdan himoya', () => {
    it("OXIRGI superadmin o'z rolini OLIB TASHLAY OLMAYDI", async () => {
      // Aks holda platformani faqat serverda SQL bilan tiklash mumkin
      // bo'lardi — bu xato jimgina sodir bo'ladi.
      const own = await t.prisma.userRole.findFirstOrThrow({
        where: { userId: adminUserId, role: 'SUPER_ADMIN' },
      });
      const res = await request(t.server)
        .delete(api(`/admin/users/roles/${own.id}`))
        .set(bearer(adminToken))
        .send({ reason: 'Ortiqcha rolni tozalayapman deb o`ylab' });
      expectProblem(res, 422, 'LAST_SUPER_ADMIN');
    });

    it("O'ZINI bloklab bo'lmaydi", async () => {
      const res = await request(t.server)
        .patch(api(`/admin/users/${adminUserId}/status`))
        .set(bearer(adminToken))
        .send({ status: 'SUSPENDED', reason: 'Tasodifiy bosish — bu o`tmasligi kerak' });
      expectProblem(res, 422, 'SELF_LOCKOUT');
    });

    it('IKKINCHI superadmin qo`shilgach, birinchisini olib tashlash mumkin', async () => {
      const granted = await request(t.server)
        .post(api(`/admin/users/${targetUserId}/roles`))
        .set(bearer(adminToken))
        .send({ role: 'SUPER_ADMIN', reason: 'Ikkinchi ma`mur — zaxira kirish uchun' });
      expect(granted.status).toBe(201);

      const own = await t.prisma.userRole.findFirstOrThrow({
        where: { userId: adminUserId, role: 'SUPER_ADMIN' },
      });
      const res = await request(t.server)
        .delete(api(`/admin/users/roles/${own.id}`))
        .set(bearer(adminToken))
        .send({ reason: 'Endi ikkinchi ma`mur bor — o`z rolimni topshiraman' });
      expect(res.status).toBe(204);

      // Qaytarib qo'yamiz: keyingi testlar superadmin talab qiladi.
      await grantRole(t.prisma, t.redis, adminUserId, 'SUPER_ADMIN');
      const second = await t.prisma.userRole.findFirstOrThrow({
        where: { userId: targetUserId, role: 'SUPER_ADMIN' },
      });
      await t.prisma.userRole.delete({ where: { id: second.id } });
      await t.redis.del(`authz:roles:${targetUserId}`);
    });
  });

  // --- Hisobni bloklash --------------------------------------------------------

  describe('hisobni bloklash', () => {
    it('bloklangan odam KIRA OLMAYDI', async () => {
      const res = await request(t.server)
        .patch(api(`/admin/users/${plainUserId}/status`))
        .set(bearer(adminToken))
        .send({ status: 'SUSPENDED', reason: 'Fair-play qoidalarini buzgani uchun tekshiruv' });
      expect(res.status).toBe(204);

      const login = await loginUser(t.server, 'oddiy@test.uz');
      expect(login.status).toBeGreaterThanOrEqual(400);
    });

    it('MAVJUD sessiyalari ham yopiladi', async () => {
      // Busiz bloklangan odam eski refresh token bilan ishlab
      // yuraverardi — `status` faqat keyingi login'da tekshiriladi.
      const active = await t.prisma.refreshToken.count({
        where: { userId: plainUserId, revokedAt: null },
      });
      expect(active).toBe(0);
    });

    it('tiklash ishlaydi va u ham audit`da', async () => {
      const res = await request(t.server)
        .patch(api(`/admin/users/${plainUserId}/status`))
        .set(bearer(adminToken))
        .send({ status: 'ACTIVE', reason: 'Tekshiruv yakunlandi — qoida buzilmagan' });
      expect(res.status).toBe(204);

      const login = await loginUser(t.server, 'oddiy@test.uz');
      expect(login.status).toBe(200);

      const actions = await auditActions(plainUserId);
      expect(actions.filter((a) => a === 'user.status_changed')).toHaveLength(2);
    });
  });
});
