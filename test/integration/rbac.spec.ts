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
 * RBAC — Faza 0 DoD: "Har rol uchun ruxsat testi bor va o'tadi"
 * (docs/14-roadmap.md).
 *
 * Ikki bosqichli model (docs/10-security.md §3):
 *  1. RbacGuard — rol-darajali gate; ruxsat yo'q → 404 (403 EMAS:
 *     resurs mavjudligi oshkor bo'lmasin, docs/04-api-spec.md §2.4).
 *  2. Service — scope tekshiruvi YUKLANGAN obyekt bilan (IDOR himoyasi).
 */
describe('RBAC (integration)', () => {
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

  async function registerAndGetToken(email: string): Promise<{ token: string; userId: string }> {
    const res = await registerUser(t.server, { email });
    expect(res.status).toBe(201);
    const token = res.body.accessToken as string;
    return { token, userId: userIdFromToken(token) };
  }

  it('anonim → POST /federations → 401 (default yopiq: JwtAuthGuard)', async () => {
    const res = await request(t.server)
      .post('/api/v1/federations')
      .send({ name: "O'zbekiston shaxmat federatsiyasi", shortName: 'UzChess', countryCode: 'UZB' });

    expectProblem(res, 401, 'UNAUTHORIZED');
  });

  it("PLAYER → POST /federations → 404 (403 EMAS — mavjudlik oshkor qilinmaydi)", async () => {
    const { token } = await registerAndGetToken('player@test.uz');

    const res = await request(t.server)
      .post('/api/v1/federations')
      .set(bearer(token))
      .send({ name: "O'zbekiston shaxmat federatsiyasi", shortName: 'UzChess', countryCode: 'UZB' });

    expectProblem(res, 404, 'NOT_FOUND');
  });

  it('SUPER_ADMIN → POST /federations → 201 (rol granti + authz kesh invalidatsiyasi)', async () => {
    const { token, userId } = await registerAndGetToken('admin@test.uz');
    // grantRole authz Redis keshini ham tozalaydi (60s TTL,
    // authz.service.ts) — rol darhol kuchga kiradi.
    await grantRole(t.prisma, t.redis, userId, 'SUPER_ADMIN');

    const res = await request(t.server)
      .post('/api/v1/federations')
      .set(bearer(token))
      .send({ name: "O'zbekiston shaxmat federatsiyasi", shortName: 'UzChess', countryCode: 'UZB' });

    expect(res.status).toBe(201);
    expect(res.body.id).toBeDefined();

    // Audit: org.federation.created (org.repository.ts).
    const audit = await t.prisma.auditLog.findMany({ where: { action: 'org.federation.created' } });
    expect(audit).toHaveLength(1);
  });

  it("Scoped IDOR: CLUB_ADMIN o'z klubini tahrirlaydi (200), begona klubni EMAS (404)", async () => {
    // Org ierarxiyasi to'g'ridan-to'g'ri DB orqali seed qilinadi —
    // sinov obyekti RBAC, org CRUD emas.
    const federation = await t.prisma.federation.create({
      data: { name: "O'zbekiston shaxmat federatsiyasi", shortName: 'UzChess', countryCode: 'UZB' },
    });
    const region = await t.prisma.region.create({
      data: { federationId: federation.id, name: 'Toshkent shahri' },
    });
    const clubA = await t.prisma.club.create({
      data: { regionId: region.id, name: 'A klubi', slug: 'a-klubi' },
    });
    const clubB = await t.prisma.club.create({
      data: { regionId: region.id, name: 'B klubi', slug: 'b-klubi' },
    });

    const { token, userId } = await registerAndGetToken('clubadmin@test.uz');
    // Rol FAQAT A klubi qamrovida (UserRole.scopeType/scopeId —
    // prisma/schema.prisma: "Faqat rolni tekshirish YETARLI EMAS").
    await grantRole(t.prisma, t.redis, userId, 'CLUB_ADMIN', 'CLUB', clubA.id);

    // O'z klubi → 200.
    const own = await request(t.server)
      .patch(`/api/v1/clubs/${clubA.id}`)
      .set(bearer(token))
      .send({ name: 'A klubi (yangilangan)' });
    expect(own.status).toBe(200);
    expect(own.body.name).toBe('A klubi (yangilangan)');

    // Begona klub → 404: guard'dan o'tadi (rol-darajali gate scope'ni
    // bilmaydi), lekin service YUKLANGAN obyekt bilan rad etadi — IDOR
    // himoyasining asosiy qatlami (docs/10-security.md §3).
    const foreign = await request(t.server)
      .patch(`/api/v1/clubs/${clubB.id}`)
      .set(bearer(token))
      .send({ name: 'B klubi (hujum)' });
    expectProblem(foreign, 404, 'NOT_FOUND');

    // DB'da B klubi o'zgarmagan.
    const untouched = await t.prisma.club.findUniqueOrThrow({ where: { id: clubB.id } });
    expect(untouched.name).toBe('B klubi');
  });
});
