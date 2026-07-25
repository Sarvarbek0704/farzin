import request from 'supertest';

import { createTestApp, type TestApp } from './app.harness';
import { expectProblem, resetState } from './helpers';

/**
 * Validatsiya va xato konturi (docs/10-security.md §6,
 * docs/04-api-spec.md §2.5):
 *
 *  - forbidNonWhitelisted: ortiqcha maydon → 400 (mass assignment himoyasi;
 *    jonli xavf: register'da `role: 'SUPER_ADMIN'` yuborish);
 *  - noma'lum marshrut → 404 RFC 9457 shaklida, ichki detal sizmaydi;
 *  - GET endpointlar autentifikatsiyasiz o'qiladi va hech narsani
 *    o'zgartirmaydi.
 */
describe('Validatsiya va xato formati (integration)', () => {
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

  it("register'da ortiqcha maydon {role: 'SUPER_ADMIN'} → 400 VALIDATION_FAILED, maydon-darajali errors[]", async () => {
    const res = await request(t.server).post('/api/v1/auth/register').send({
      email: 'hujumchi@test.uz',
      password: 'kuchli-parol-2026',
      firstName: 'Hujumchi',
      lastName: 'Test',
      // DTO'da YO'Q maydon — forbidNonWhitelisted rad etishi SHART.
      role: 'SUPER_ADMIN',
    });

    expectProblem(res, 400, 'VALIDATION_FAILED');
    expect(Array.isArray(res.body.errors)).toBe(true);
    const fields = (res.body.errors as { field: string; code: string }[]).map((e) => e.field);
    expect(fields).toContain('role');

    // Foydalanuvchi YARATILMAGAN — validatsiya service'gacha yetkazmaydi.
    const count = await t.prisma.user.count();
    expect(count).toBe(0);
  });

  it("noma'lum marshrut → 404 RFC 9457, ichki detal (stack, fayl yo'li) sizmaydi", async () => {
    const res = await request(t.server).get('/api/v1/mavjud-emas-marshrut');

    expectProblem(res, 404, 'NOT_FOUND');
    const serialized = JSON.stringify(res.body);
    // 500-toifa sizishlarga qarshi ham xuddi shu qoida: stack yo'q,
    // fayl yo'li yo'q (problem-details.filter.ts, docs/10-security.md).
    expect(serialized).not.toContain('stack');
    expect(serialized).not.toContain('node_modules');
    expect(serialized).not.toContain('src\\');
    expect(serialized).not.toContain('src/');
  });

  it('GET /players autentifikatsiyasiz → 200 {items, pageInfo} va hech narsa o\'zgarmaydi', async () => {
    const res = await request(t.server).get('/api/v1/players');

    expect(res.status).toBe(200);
    expect(res.body).toEqual({
      items: [],
      pageInfo: { hasNextPage: false, endCursor: null },
    });
  });

  it("global prefiksdan istisno: GET /health prefikssiz ishlaydi (docs/04-api-spec.md §2.1)", async () => {
    const res = await request(t.server).get('/health');
    // Terminus javobi: real DB/Redis tekshiruvi — konteynerlar tirik.
    expect(res.status).toBe(200);
  });
});
