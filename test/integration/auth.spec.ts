import request from 'supertest';

import { createTestApp, type TestApp } from './app.harness';
import {
  bearer,
  cookieValue,
  DEFAULT_PASSWORD,
  extractRefreshCookie,
  loginUser,
  logoutWithCookie,
  refreshWithCookie,
  registerUser,
  resetState,
  setCookieLines,
  userIdFromToken,
  expectProblem,
} from './helpers';

/**
 * Auth oqimi — Faza 0 DoD yadrosi (docs/14-roadmap.md "Tayyorlik mezoni"):
 *
 *  - [x] Ro'yxatdan o'tish → kirish → token refresh → chiqish
 *  - [x] Refresh token reuse aniqlanadi va SESSIYA OILASI bekor qilinadi
 *  - [x] Audit yozuvlari (user.registered, auth.login, reuse)
 *  - [x] Sirlar (parol, xom refresh token) hech qayerda ochiq saqlanmaydi
 *
 * REAL PostgreSQL + Redis (Testcontainers) — docs/13-testing-strategy.md §3.
 */
describe('Auth oqimi (integration)', () => {
  let t: TestApp;

  beforeAll(async () => {
    t = await createTestApp();
  });

  afterAll(async () => {
    await t.close();
  });

  beforeEach(async () => {
    // Rate-limit (register 3/soat IP) va authz keshi ham tozalanadi.
    await resetState(t.prisma, t.redis);
  });

  it("register → 201: access token body'da, refresh httpOnly cookie'da, /auth/me ishlaydi", async () => {
    const res = await registerUser(t.server, { email: 'reg@test.uz' });

    expect(res.status).toBe(201);
    expect(typeof res.body.accessToken).toBe('string');
    expect(res.body.expiresIn).toBe(900);
    // Refresh token body'da QAYTMAYDI — faqat cookie (docs/10-security.md §2.4).
    expect(res.body.refreshToken).toBeUndefined();

    const cookieLine = setCookieLines(res).find((c) => c.startsWith('farzin_rt='));
    expect(cookieLine).toBeDefined();
    expect(cookieLine).toContain('HttpOnly');
    expect(cookieLine).toContain('Path=/api/v1/auth');
    expect(cookieLine).toContain('SameSite=Strict');

    const me = await request(t.server)
      .get('/api/v1/auth/me')
      .set(bearer(res.body.accessToken as string));
    expect(me.status).toBe(200);
    expect(me.body.userId).toBe(userIdFromToken(res.body.accessToken as string));

    // Audit: user.registered — biznes o'zgarishi bilan bir tranzaksiyada.
    const audit = await t.prisma.auditLog.findMany({ where: { action: 'user.registered' } });
    expect(audit).toHaveLength(1);
    expect(audit[0]!.resourceId).toBe(me.body.userId);
  });

  it('login → 200 va auth.login audit yozuvi bor', async () => {
    await registerUser(t.server, { email: 'login@test.uz' });

    const res = await loginUser(t.server, 'login@test.uz');
    expect(res.status).toBe(200);
    expect(typeof res.body.accessToken).toBe('string');
    expect(extractRefreshCookie(res)).toContain('farzin_rt=');

    const audit = await t.prisma.auditLog.findMany({ where: { action: 'auth.login' } });
    expect(audit).toHaveLength(1);
  });

  it("noto'g'ri parol → 401 INVALID_CREDENTIALS (RFC 9457 shaklida)", async () => {
    await registerUser(t.server, { email: 'wrongpass@test.uz' });

    const res = await loginUser(t.server, 'wrongpass@test.uz', 'notogri-parol-123');
    expectProblem(res, 401, 'INVALID_CREDENTIALS');
    expect(res.body.type).toBe('https://farzin.uz/errors/invalid-credentials');
  });

  it("mavjud bo'lmagan email → 401 XUDDI SHU kod (user enumeration yo'q)", async () => {
    // docs/10-security.md §2.1: email bormi-yo'qmi — javob FARQ QILMAYDI.
    const res = await loginUser(t.server, 'yoq-odam@test.uz', 'har-qanday-parol');
    expectProblem(res, 401, 'INVALID_CREDENTIALS');
  });

  it('refresh rotatsiyasi → 200, yangi cookie eskisidan farq qiladi', async () => {
    const reg = await registerUser(t.server, { email: 'rotate@test.uz' });
    const cookieA = extractRefreshCookie(reg);

    const refreshed = await refreshWithCookie(t.server, cookieA);
    expect(refreshed.status).toBe(200);
    expect(typeof refreshed.body.accessToken).toBe('string');

    const cookieB = extractRefreshCookie(refreshed);
    expect(cookieValue(cookieB)).not.toBe(cookieValue(cookieA));
  });

  it('REUSE DETECTION: eski token qayta kelsa BUTUN OILA bekor + audit (jonli bug regressiyasi)', async () => {
    // ⚠️  Regressiya konteksti (refresh-token.repository.ts izohi):
    //     ilgari reuse aniqlanganda revokeFamily + audit tranzaksiya
    //     ICHIDA throw tufayli ROLLBACK bo'lardi — o'g'irlik aniqlanadi-yu,
    //     oila TIRIK qolardi. Outcome pattern buni tuzatdi; bu test o'sha
    //     xatoning qaytmasligini qo'riqlaydi.
    const reg = await registerUser(t.server, { email: 'reuse@test.uz' });
    const cookieA = extractRefreshCookie(reg);

    const refreshed = await refreshWithCookie(t.server, cookieA);
    expect(refreshed.status).toBe(200);
    const cookieB = extractRefreshCookie(refreshed);

    // 1. Ishlatilgan (eski) token qayta keldi → 401.
    const replay = await refreshWithCookie(t.server, cookieA);
    expectProblem(replay, 401, 'UNAUTHORIZED');

    // 2. ENG YANGI token ham o'lik bo'lishi SHART — oila to'liq bekor.
    const newest = await refreshWithCookie(t.server, cookieB);
    expectProblem(newest, 401, 'UNAUTHORIZED');

    // 3. Audit yozuvi COMMIT qilingan (rollback EMAS).
    const audit = await t.prisma.auditLog.findMany({
      where: { action: 'auth.refresh_reuse_detected' },
    });
    expect(audit.length).toBeGreaterThanOrEqual(1);

    // 4. DB darajasida: oiladagi BARCHA tokenlar revokedAt bilan.
    const userId = userIdFromToken(reg.body.accessToken as string);
    const alive = await t.prisma.refreshToken.count({
      where: { userId, revokedAt: null },
    });
    expect(alive).toBe(0);
  });

  it('logout → 204, cookie tozalanadi, keyingi refresh 401', async () => {
    const reg = await registerUser(t.server, { email: 'logout@test.uz' });
    const cookie = extractRefreshCookie(reg);

    const out = await logoutWithCookie(t.server, cookie);
    expect(out.status).toBe(204);

    // clearCookie — bo'sh qiymatli farzin_rt yuboriladi.
    const cleared = setCookieLines(out).find((c) => c.startsWith('farzin_rt='));
    expect(cleared).toBeDefined();
    expect(cookieValue(cleared!.split(';')[0]!)).toBe('');

    // Bekor qilingan token bilan refresh → 401 (idempotent himoya).
    const after = await refreshWithCookie(t.server, cookie);
    expectProblem(after, 401, 'UNAUTHORIZED');
  });

  it('sirlar hech qayerda OCHIQ saqlanmaydi: parol faqat Argon2, token faqat SHA-256', async () => {
    // docs/14-roadmap.md Faza 0 DoD: "Log'da parol/token yo'qligi".
    // Log oqimiga bevosita ulanib bo'lmaydi (pino sonic-boom fd=1),
    // shuning uchun kafolat SAQLASH qatlamida tekshiriladi: parol va
    // xom refresh token DB'da/auditda hech qayerda plaintext emas.
    const reg = await registerUser(t.server, { email: 'secrets@test.uz' });
    const rawRefreshToken = cookieValue(extractRefreshCookie(reg));

    const user = await t.prisma.user.findUniqueOrThrow({ where: { email: 'secrets@test.uz' } });
    expect(user.passwordHash).not.toBeNull();
    expect(user.passwordHash).toMatch(/^\$argon2id\$/); // ADR-0004: bcrypt EMAS
    expect(user.passwordHash).not.toContain(DEFAULT_PASSWORD);

    const tokens = await t.prisma.refreshToken.findMany({ where: { userId: user.id } });
    expect(tokens.length).toBeGreaterThanOrEqual(1);
    for (const token of tokens) {
      // DB'da FAQAT SHA-256 hex — xom token saqlanmaydi (docs/10-security.md §2.2).
      expect(token.tokenHash).toMatch(/^[0-9a-f]{64}$/);
      expect(token.tokenHash).not.toBe(rawRefreshToken);
    }

    // Audit satrlarida ham parol/xom token yo'q.
    const audit = await t.prisma.auditLog.findMany();
    const serialized = JSON.stringify(audit);
    expect(serialized).not.toContain(DEFAULT_PASSWORD);
    expect(serialized).not.toContain(rawRefreshToken);
  });

  // --- Rate limit: umumiy IP (NAT) stsenariysi ---------------------------------
  //
  //  docs/AUDIT.md JIDDIY-4. Muammo: `login:ip` hisoblagichi MUVAFFAQIYATLI
  //  kirishda ham sarflanardi va hech qachon qaytarilmasdi (`limiter.reset`
  //  faqat `emailKey` uchun chaqirilardi). Natijada bitta tashqi IP ortidagi
  //  6-chi foydalanuvchi TO'G'RI parol bilan ham 15 daqiqa qulflanardi.
  //
  //  O'zbekiston konteksti bu stsenariyni chekka holat emas, ODATIY qiladi:
  //  maktab kompyuter sinfi (Faza 7 B2G maqsadli segmenti), internet-kafe,
  //  turnir zali Wi-Fi va mobil operatorlarning CGNAT'i — hammasi bitta IP.
  describe('umumiy IP (NAT) ortidagi foydalanuvchilar', () => {
    /**
     * Ro'yxatdan o'tish limiti (3/soat/IP) bu testning MAVZUSI EMAS —
     * u alohida chegara. Shuning uchun faqat `rl:register:*` kalitlari
     * tozalanadi; `rl:login:*` DAXLSIZ qoladi, aks holda test o'zi
     * tekshirayotgan narsani yuvib yuborardi.
     */
    async function clearRegisterLimitOnly(): Promise<void> {
      const keys = await t.redis.keys('rl:register:*');
      if (keys.length > 0) {
        await t.redis.del(...keys);
      }
    }

    it("6 ta HAR XIL foydalanuvchi bitta IP'dan muvaffaqiyatli kira oladi", async () => {
      const emails = Array.from({ length: 6 }, (_, i) => `nat${String(i)}@test.uz`);

      for (const email of emails) {
        await clearRegisterLimitOnly();
        const reg = await registerUser(t.server, { email });
        expect(reg.status).toBe(201);
      }

      // Endi HECH QANDAY limit tozalanmaydi: supertest hamma so'rovni
      // 127.0.0.1 dan yuboradi, ya'ni oltalasi ham bitta `login:ip` kalitini
      // bo'lishadi — aynan NAT holati.
      const statuses: number[] = [];
      for (const email of emails) {
        const res = await loginUser(t.server, email);
        statuses.push(res.status);
      }

      // Tuzatishdan OLDIN bu yerda [200,200,200,200,200,429] chiqardi.
      expect(statuses).toEqual([200, 200, 200, 200, 200, 200]);
    });

    it('bitta HISOBGA 5 ta xato urinish → 6-chisi bloklanadi (email kaliti)', async () => {
      // Himoya xususiyati saqlanishi shart: limitni butunlay olib tashlash
      // yoki muvaffaqiyatda kalitni tozalash — bu testni yiqitadi.
      await registerUser(t.server, { email: 'brute@test.uz' });

      for (let i = 0; i < 5; i += 1) {
        const bad = await loginUser(t.server, 'brute@test.uz', 'butunlay-boshqa-parol');
        expectProblem(bad, 401, 'INVALID_CREDENTIALS');
      }

      // 6-chi urinish — parol TO'G'RI bo'lsa ham rad etiladi: shu HISOBGA
      // allaqachon 5 marta xato qilingan (LOGIN_LIMIT, kalit `login:email`).
      const blocked = await loginUser(t.server, 'brute@test.uz');
      expectProblem(blocked, 429, 'TOO_MANY_ATTEMPTS');
    });

    it("bitta IP'dan TURLI hisoblarga 20 ta xato urinish → 21-chisi bloklanadi (IP kaliti)", async () => {
      // Credential stuffing naqshi: har safar boshqa email, ya'ni
      // `login:email` kaliti hech qachon to'lmaydi — faqat `login:ip`
      // ushlaydi. Mavjud bo'lmagan emaillar ataylab: user enumeration
      // himoyasi tufayli javob bir xil (401) va ro'yxatdan o'tish
      // limiti bu testga aralashmaydi.
      for (let i = 0; i < 20; i += 1) {
        const bad = await loginUser(t.server, `stuff${String(i)}@test.uz`, 'har-xil-parol');
        expectProblem(bad, 401, 'INVALID_CREDENTIALS');
      }

      const blocked = await loginUser(t.server, 'stuff-oxirgi@test.uz', 'har-xil-parol');
      expectProblem(blocked, 429, 'TOO_MANY_ATTEMPTS');
    });
  });
});
