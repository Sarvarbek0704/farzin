import request from 'supertest';

import { AnalysisProcessor } from '../../src/modules/fairplay/analysis.processor';
import { bearer, expectProblem, grantRole, registerUser, resetState, userIdFromToken } from './helpers';
import { createTestApp, type TestApp } from './app.harness';

/**
 * Fairplay integratsiya testi — docs/08-fair-play.md, docs/14 Faza 6 DoD.
 *
 * ENG MUHIM BLOK — "NO AUTO PUNISHMENT": protsessor ochgan ish OPEN,
 * sanksiya yo'q, o'yinchi ban qilinmagan; sanksiya FAQAT /decide (odam +
 * yozma asos) orqali. DoD: "Hech qanday avtomatik jazo yo'qligi kod'da
 * tasdiqlangan".
 *
 * PROTSESSOR CHAQIRUVI — to'g'ridan-to'g'ri process() (hujjatlangan
 * tanlov): BullMQ Worker'ni test Redis'ga qarshi ko'tarish taymingga
 * bog'liq va mo'rt; handler'ning o'zi esa navbatdan mustaqil sof
 * orkestratsiya. Navbat wiring'i worker.ts'da (prod yo'li).
 *
 * Engine YO'Q muhitda ishlaydi (STOCKFISH_PATH berilmagan) — korrelyatsiya
 * toza o'chirilgan, vaqt signali yetarli (provider-gating tekshiruvi ham).
 *
 * Register limiti 3/soat/IP: 3 registratsiya → redis flush → yana 2.
 */
describe('fairplay (integration)', () => {
  let t: TestApp;

  let tokenA = ''; // suspect (oq) — PLAYER
  let tokenB = ''; // reporter (qora) — PLAYER
  let tokenSA1 = ''; // SUPER_ADMIN (birinchi qaror)
  let tokenSA2 = ''; // SUPER_ADMIN (apellyatsiya — boshqa tarkib)
  let tokenClub = ''; // CLUB_ADMIN — FairPlayCase ko'rmaydi

  let userIdA = '';
  let playerIdA = '';
  let playerIdB = '';
  let gameId = '';
  let caseAId = '';
  let caseBId = '';
  let appealId = '';

  const RATIONALE = "Ikkala mustaqil xulosa ham vaqt naqshini tasdiqladi — 4-daraja sanksiya";

  beforeAll(async () => {
    t = await createTestApp();
    await resetState(t.prisma, t.redis);

    const resA = await registerUser(t.server, { email: 'fp-suspect@farzin.uz' });
    const resB = await registerUser(t.server, { email: 'fp-reporter@farzin.uz' });
    const resSA1 = await registerUser(t.server, { email: 'fp-admin1@farzin.uz' });
    expect(resA.status).toBe(201);
    expect(resB.status).toBe(201);
    expect(resSA1.status).toBe(201);
    // Register limiti 3/soat/IP — limiter kalitlarini tozalab davom etamiz.
    await t.redis.flushall();
    const resSA2 = await registerUser(t.server, { email: 'fp-admin2@farzin.uz' });
    const resClub = await registerUser(t.server, { email: 'fp-club@farzin.uz' });
    expect(resSA2.status).toBe(201);
    expect(resClub.status).toBe(201);

    tokenA = resA.body.accessToken as string;
    tokenB = resB.body.accessToken as string;
    tokenSA1 = resSA1.body.accessToken as string;
    tokenSA2 = resSA2.body.accessToken as string;
    tokenClub = resClub.body.accessToken as string;

    userIdA = userIdFromToken(tokenA);
    const playerA = await t.prisma.player.findFirst({ where: { userId: userIdA } });
    const playerB = await t.prisma.player.findFirst({
      where: { userId: userIdFromToken(tokenB) },
    });
    if (playerA === null || playerB === null) {
      throw new Error('registratsiya Player profilini yaratmadi');
    }
    playerIdA = playerA.id;
    playerIdB = playerB.id;

    await grantRole(t.prisma, t.redis, userIdFromToken(tokenSA1), 'SUPER_ADMIN');
    await grantRole(t.prisma, t.redis, userIdFromToken(tokenSA2), 'SUPER_ADMIN');
    await grantRole(t.prisma, t.redis, userIdFromToken(tokenClub), 'CLUB_ADMIN');

    // Tugagan RAPID reytingli o'yin + 60 ply. Oq (A): bot-simon BIR TEKIS
    // vaqtlar; qora (B): inson-simon o'zgaruvchan. Engine yo'q — fen/uci
    // qiymatlari tahlilda ishlatilmaydi (vaqt seriyasi yetarli).
    const game = await t.prisma.onlineGame.create({
      data: {
        whitePlayerId: playerIdA,
        blackPlayerId: playerIdB,
        status: 'RESIGNATION',
        timeCategory: 'RAPID',
        clockType: 'FISCHER_INCREMENT',
        baseTimeSeconds: 600,
        incrementSeconds: 5,
        isRated: true,
        winnerColor: 'BLACK',
        startedAt: new Date(Date.now() - 3_600_000),
        endedAt: new Date(),
      },
    });
    gameId = game.id;

    const moves = Array.from({ length: 60 }, (_, i) => {
      const ply = i + 1;
      const isWhite = ply % 2 === 1;
      return {
        gameId,
        ply,
        san: 'Nf3',
        uci: 'g1f3',
        fenAfter: `fen-${String(ply)}`,
        positionHash: `hash-${String(ply)}`,
        // Oq: ~4s har yurish (bot-simon). Qora: og'ir dumli inson naqshi.
        thinkTimeMs: isWhite ? 4_000 : (ply % 10 === 0 ? 55_000 : 1_500 + (ply % 7) * 900),
        clockAfterMs: 500_000,
      };
    });
    await t.prisma.move.createMany({ data: moves });
  });

  afterAll(async () => {
    await t.close();
  });

  // --- Manual report → signal + ish ------------------------------------------------

  it("shikoyat → MANUAL_REPORT signal + OPEN ish; javobda ish ID'si YO'Q", async () => {
    const res = await request(t.server)
      .post('/api/v1/fairplay/reports')
      .set(bearer(tokenB))
      .send({ gameId, reason: 'Raqib har pozitsiyada bir xil tezlikda eng yaxshi yurishni topdi' });

    expect(res.status).toBe(202);
    expect(res.body).toEqual({ received: true }); // caseId sizib chiqmaydi (docs/08 §4.2)

    const fpCase = await t.prisma.fairPlayCase.findFirst({ where: { playerId: playerIdA } });
    expect(fpCase).not.toBeNull();
    expect(fpCase!.status).toBe('OPEN');
    caseAId = fpCase!.id;

    const signals = await t.prisma.fairPlaySignal.findMany({ where: { caseId: caseAId } });
    expect(signals).toHaveLength(1);
    expect(signals[0]!.type).toBe('MANUAL_REPORT');

    const audit = await t.prisma.auditLog.findFirst({
      where: { action: 'fairplay.reported', resourceId: caseAId },
    });
    expect(audit).not.toBeNull();
  });

  it('shikoyatchi ishtirokchi bo\'lmasa suspectPlayerId talab qilinadi (422)', async () => {
    const res = await request(t.server)
      .post('/api/v1/fairplay/reports')
      .set(bearer(tokenClub))
      .send({ gameId, reason: 'Chetdan kuzatdim, juda shubhali edi' });
    expectProblem(res, 422, 'SUSPECT_REQUIRED');
  });

  // --- Protsessor: tahlil → report + flag -------------------------------------------

  it('protsessor: vaqt tahlili → FairPlayReport + TIMING_ANOMALY signal + skor', async () => {
    const processor = t.app.get(AnalysisProcessor);
    await processor.process({ gameId, playerId: playerIdA });

    const report = await t.prisma.fairPlayReport.findUnique({
      where: { gameId_playerId: { gameId, playerId: playerIdA } },
    });
    expect(report).not.toBeNull();
    expect(report!.timingVariance).not.toBeNull();
    expect(Number(report!.suspicionScore)).toBeGreaterThanOrEqual(0.6);
    // Engine yo'q (STOCKFISH_PATH berilmagan) — korrelyatsiya maydonlari bo'sh.
    expect(report!.topMoveMatchRate).toBeNull();
    expect(report!.engineName).toBeNull();

    const signals = await t.prisma.fairPlaySignal.findMany({ where: { caseId: caseAId } });
    expect(signals.map((s) => s.type).sort()).toEqual(['MANUAL_REPORT', 'TIMING_ANOMALY']);

    const fpCase = await t.prisma.fairPlayCase.findUnique({ where: { id: caseAId } });
    expect(Number(fpCase!.aggregateScore)).toBeGreaterThan(0.8);

    const flagged = await t.prisma.auditLog.findFirst({
      where: { action: 'fairplay.flagged', resourceId: caseAId },
    });
    expect(flagged).not.toBeNull();
    expect(flagged!.actorUserId).toBeNull(); // tizim harakati
  });

  it('protsessor IDEMPOTENT — qayta ishga tushirish signal/report ko\'paytirmaydi', async () => {
    const processor = t.app.get(AnalysisProcessor);
    await processor.process({ gameId, playerId: playerIdA });

    const reports = await t.prisma.fairPlayReport.findMany({
      where: { gameId, playerId: playerIdA },
    });
    expect(reports).toHaveLength(1);
    const signals = await t.prisma.fairPlaySignal.findMany({ where: { caseId: caseAId } });
    expect(signals).toHaveLength(2);
  });

  // --- NO AUTO PUNISHMENT (docs/14 Faza 6 DoD, docs/08 §4.1) ------------------------

  it("HECH QANDAY AVTOMATIK JAZO YO'Q: skor qancha yuqori bo'lmasin — ish OPEN, sanksiya yo'q, o'yinchi ban emas", async () => {
    const fpCase = await t.prisma.fairPlayCase.findUnique({ where: { id: caseAId } });
    // Skor chegaradan yuqori — lekin:
    expect(Number(fpCase!.aggregateScore)).toBeGreaterThan(0.6);
    // 1) ish faqat KO'RINADI — status OPEN, qaror yo'q;
    expect(fpCase!.status).toBe('OPEN');
    expect(fpCase!.reviewedBy).toBeNull();
    expect(fpCase!.decisionRationale).toBeNull();
    // 2) sanksiya YO'Q;
    expect(fpCase!.sanctionUntil).toBeNull();
    // 3) o'yinchi hisobi TEGILMAGAN — ban/suspend yo'q (holat registratsiya
    //    paytidagidek qoladi: PENDING_VERIFICATION/ACTIVE).
    const user = await t.prisma.user.findUnique({ where: { id: userIdA } });
    expect(user!.status).not.toBe('BANNED');
    expect(user!.status).not.toBe('SUSPENDED');
    // 4) jazo audit'i ham yo'q — hech kim qaror chiqarmagan.
    const decision = await t.prisma.auditLog.findFirst({ where: { action: 'fairplay.decision' } });
    expect(decision).toBeNull();
  });

  // --- Komissiya ro'yxati va kirish nazorati ----------------------------------------

  it('SUPER_ADMIN: ro\'yxat aggregateScore DESC + cursor', async () => {
    // Ikkinchi (pastroq skorli) ish — tartiblashni tekshirish uchun.
    const caseB = await t.prisma.fairPlayCase.create({
      data: { playerId: playerIdB, status: 'OPEN', aggregateScore: 0.2 },
    });
    caseBId = caseB.id;

    const page1 = await request(t.server)
      .get('/api/v1/fairplay/cases?first=1')
      .set(bearer(tokenSA1));
    expect(page1.status).toBe(200);
    expect(page1.body.items).toHaveLength(1);
    expect(page1.body.items[0].id).toBe(caseAId); // eng yuqori skor birinchi
    expect(page1.body.pageInfo.hasNextPage).toBe(true);

    const page2 = await request(t.server)
      .get(`/api/v1/fairplay/cases?first=1&after=${encodeURIComponent(page1.body.pageInfo.endCursor as string)}`)
      .set(bearer(tokenSA1));
    expect(page2.status).toBe(200);
    expect(page2.body.items[0].id).toBe(caseBId);
  });

  it('SUPER_ADMIN: ish detali — signal + report + evidence', async () => {
    const res = await request(t.server)
      .get(`/api/v1/fairplay/cases/${caseAId}`)
      .set(bearer(tokenSA1));
    expect(res.status).toBe(200);
    expect(res.body.case.id).toBe(caseAId);
    expect(res.body.signals).toHaveLength(2);
    expect(res.body.reports.length).toBeGreaterThanOrEqual(1);
    const signals = res.body.signals as { type: string; evidence: { sampleSize: number } }[];
    const timing = signals.find((s) => s.type === 'TIMING_ANOMALY');
    expect(timing).toBeDefined();
    expect(timing!.evidence.sampleSize).toBeGreaterThanOrEqual(20);
  });

  it("CLUB_ADMIN FairPlayCase KO'RMAYDI — 404 (matritsa: bosim vektori)", async () => {
    const list = await request(t.server).get('/api/v1/fairplay/cases').set(bearer(tokenClub));
    expectProblem(list, 404, 'NOT_FOUND');
    const detail = await request(t.server)
      .get(`/api/v1/fairplay/cases/${caseAId}`)
      .set(bearer(tokenClub));
    expectProblem(detail, 404, 'NOT_FOUND');
  });

  it("PLAYER komissiya ro'yxatini ko'rmaydi (404), lekin my-cases'da O'Z ishini CHEKLANGAN ko'radi", async () => {
    const commission = await request(t.server).get('/api/v1/fairplay/cases').set(bearer(tokenA));
    expectProblem(commission, 404, 'NOT_FOUND');

    const own = await request(t.server).get('/api/v1/fairplay/my-cases').set(bearer(tokenA));
    expect(own.status).toBe(200);
    expect(own.body).toHaveLength(1);
    const view = own.body[0];
    expect(view.id).toBe(caseAId);
    expect(view.status).toBe('OPEN');
    // Detektsiya ichki detali OSHKOR EMAS (docs/08: "aniq chegaralar yo'q").
    expect(view).not.toHaveProperty('aggregateScore');
    expect(view).not.toHaveProperty('signals');
    expect(view).not.toHaveProperty('playerId');
  });

  // --- Qaror: faqat odam + yozma asos ----------------------------------------------

  it('decide YOZMA ASOSSIZ → 422 RATIONALE_REQUIRED', async () => {
    const res = await request(t.server)
      .post(`/api/v1/fairplay/cases/${caseAId}/decide`)
      .set(bearer(tokenSA1))
      .send({ decision: 'CLOSED_SANCTION', sanctionUntil: futureIso() });
    expectProblem(res, 422, 'RATIONALE_REQUIRED');
  });

  it('decide PLAYER tomonidan → 404 (matritsa: update faqat SUPER_ADMIN)', async () => {
    const res = await request(t.server)
      .post(`/api/v1/fairplay/cases/${caseAId}/decide`)
      .set(bearer(tokenA))
      .send({ decision: 'CLOSED_NO_ACTION', rationale: RATIONALE });
    expectProblem(res, 404, 'NOT_FOUND');
  });

  it('sanctionUntil sanksiyasiz qaror bilan → 422', async () => {
    const res = await request(t.server)
      .post(`/api/v1/fairplay/cases/${caseAId}/decide`)
      .set(bearer(tokenSA1))
      .send({ decision: 'CLOSED_NO_ACTION', rationale: RATIONALE, sanctionUntil: futureIso() });
    expectProblem(res, 422, 'SANCTION_WITHOUT_SANCTION_DECISION');
  });

  it('decide yozma asos bilan → sanksiya + audit (sanksiyaga YAGONA yo\'l)', async () => {
    const res = await request(t.server)
      .post(`/api/v1/fairplay/cases/${caseAId}/decide`)
      .set(bearer(tokenSA1))
      .send({ decision: 'CLOSED_SANCTION', rationale: RATIONALE, sanctionUntil: futureIso() });

    expect(res.status).toBe(200);
    expect(res.body.status).toBe('CLOSED_SANCTION');
    expect(res.body.sanctionUntil).not.toBeNull();
    expect(res.body.reviewedBy).toBe(userIdFromToken(tokenSA1));

    const audit = await t.prisma.auditLog.findFirst({
      where: { action: 'fairplay.decision', resourceId: caseAId },
    });
    expect(audit).not.toBeNull();
    expect(audit!.actorUserId).toBe(userIdFromToken(tokenSA1)); // ODAM, tizim emas
    expect((audit!.after as { reason?: string }).reason).toBe(RATIONALE);

    // Takror qaror → 409 (qaror bir marta chiqadi).
    const again = await request(t.server)
      .post(`/api/v1/fairplay/cases/${caseAId}/decide`)
      .set(bearer(tokenSA1))
      .send({ decision: 'CLOSED_NO_ACTION', rationale: RATIONALE });
    expectProblem(again, 409, 'CONFLICT');
  });

  // --- Apellyatsiya (docs/08 §4.2, §6.2) --------------------------------------------

  it("apellyatsiya: begona o'yinchi bera olmaydi (404 — deny→404)", async () => {
    const res = await request(t.server)
      .post(`/api/v1/fairplay/cases/${caseAId}/appeals`)
      .set(bearer(tokenB))
      .send({ reason: "Bu ish bo'yicha men apellyatsiya beraman" });
    expectProblem(res, 404, 'NOT_FOUND');
  });

  it("apellyatsiya: o'yinchi o'z ishi bo'yicha beradi → 201", async () => {
    const res = await request(t.server)
      .post(`/api/v1/fairplay/cases/${caseAId}/appeals`)
      .set(bearer(tokenA))
      .send({ reason: "Vaqt naqshim doim shunday — barcha o'yinlarimni tekshiring" });

    expect(res.status).toBe(201);
    expect(res.body.status).toBe('SUBMITTED');
    expect(res.body.fairPlayCaseId).toBe(caseAId);
    appealId = res.body.id as string;

    const audit = await t.prisma.auditLog.findFirst({
      where: { action: 'appeal.submitted', resourceId: appealId },
    });
    expect(audit).not.toBeNull();

    // Egasi o'qiy oladi; begona PLAYER — 404.
    const ownRead = await request(t.server).get(`/api/v1/appeals/${appealId}`).set(bearer(tokenA));
    expect(ownRead.status).toBe(200);
    const foreignRead = await request(t.server)
      .get(`/api/v1/appeals/${appealId}`)
      .set(bearer(tokenB));
    expectProblem(foreignRead, 404, 'NOT_FOUND');
  });

  it('apellyatsiyani BIRINCHI qarorni chiqargan odam hal qila olmaydi → 422 (boshqa tarkib)', async () => {
    const res = await request(t.server)
      .post(`/api/v1/appeals/${appealId}/decide`)
      .set(bearer(tokenSA1))
      .send({ status: 'UPHELD', decision: 'Dalillar yetarli emas edi, sanksiya bekor qilinadi' });
    expectProblem(res, 422, 'APPEAL_SAME_REVIEWER');
  });

  it('apellyatsiya qarori yozma asossiz → 422', async () => {
    const res = await request(t.server)
      .post(`/api/v1/appeals/${appealId}/decide`)
      .set(bearer(tokenSA2))
      .send({ status: 'UPHELD' });
    expectProblem(res, 422, 'APPEAL_DECISION_TEXT_REQUIRED');
  });

  it('UPHELD → ish APPEALED + sanksiya BEKOR + audit (odam qarori)', async () => {
    const decisionText = "Vaqt naqshi o'yinchining boshqa o'yinlarida ham bir xil — sanksiya bekor";
    const res = await request(t.server)
      .post(`/api/v1/appeals/${appealId}/decide`)
      .set(bearer(tokenSA2))
      .send({ status: 'UPHELD', decision: decisionText });

    expect(res.status).toBe(200);
    expect(res.body.status).toBe('UPHELD');

    const fpCase = await t.prisma.fairPlayCase.findUnique({ where: { id: caseAId } });
    expect(fpCase!.status).toBe('APPEALED');
    expect(fpCase!.sanctionUntil).toBeNull(); // sanksiya tozalandi

    const audit = await t.prisma.auditLog.findFirst({
      where: { action: 'appeal.decision', resourceId: appealId },
    });
    expect(audit).not.toBeNull();
    expect(audit!.actorUserId).toBe(userIdFromToken(tokenSA2));
    expect((audit!.after as { reason?: string }).reason).toBe(decisionText);

    // Takror → 409.
    const again = await request(t.server)
      .post(`/api/v1/appeals/${appealId}/decide`)
      .set(bearer(tokenSA2))
      .send({ status: 'REJECTED', decision: decisionText });
    expectProblem(again, 409, 'CONFLICT');
  });
});

function futureIso(): string {
  return new Date(Date.now() + 90 * 24 * 3_600_000).toISOString();
}
