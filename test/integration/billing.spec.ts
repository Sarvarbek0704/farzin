import { randomUUID } from 'node:crypto';

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
 * Billing (Faza 4) — to'liq API oqimi (docs/14-roadmap.md Faza 4 DoD,
 * docs/09-payments-and-billing.md):
 *
 *  1. admin start pulili (5 000 000 tiyin = 50 000 so'm) turnir + seksiya
 *     yaratadi, REGISTRATION_OPEN;
 *  2. o'yinchi o'zini ro'yxatga oladi → isConfirmed FALSE
 *     (PENDING_PAYMENT semantikasi);
 *  3. o'yinchi invoys yaratadi → 201, 'FRZ-YYYY-NNNNNN',
 *     totalAmount '5000000' (BigInt JSON'da string — ADR-0006);
 *  4. MANUAL to'lov Idempotency-Key bilan; REPLAY (5x) → bitta Payment
 *     (DoD: "webhook 5 marta → bitta Payment"); boshqa body + shu kalit
 *     → 422 IDEMPOTENCY_KEY_REUSE; header'siz → 400;
 *  5. admin confirm-manual (sabab) → payment PAID, invoice PAID,
 *     registration isConfirmed TRUE, ledger balanslangan
 *     (SUM(debit)==SUM(credit) — DB'dan), audit 'payment.succeeded',
 *     outbox 'PaymentCompleted';
 *  6. QAYTA confirm → idempotent no-op (ledger yozuvlari ko'paymaydi);
 *  7. refund (sabab) → REFUNDED + teskari yozuvlar, ledger BARIBIR
 *     balanslangan, audit 'refund.requested', outbox 'RefundIssued';
 *  8. reconciliation → imbalance '0'.
 *
 * ⚠️  Register limiti 3/soat IP (docs/10-security.md §7.1) — bu faylda
 *     AYNAN 2 foydalanuvchi yaratiladi (resetState limitni tozalaydi).
 *
 * Testlar KETMA-KET bitta oqim holatini bo'lishadi.
 */
describe('Billing (integration)', () => {
  let t: TestApp;

  const ENTRY_FEE_TIYIN = 5_000_000; // 50 000 so'm

  let adminToken: string;
  let playerToken: string;
  let registrationId: string;
  let invoiceId: string;
  let paymentId: string;
  const idempotencyKey = randomUUID();

  beforeAll(async () => {
    t = await createTestApp();
    await resetState(t.prisma, t.redis);

    const admin = await registerUser(t.server, { email: 'billing-admin@test.uz' });
    adminToken = admin.body.accessToken as string;
    await grantRole(t.prisma, t.redis, userIdFromToken(adminToken), 'SUPER_ADMIN');

    const player = await registerUser(t.server, {
      email: 'billing-player@test.uz',
      firstName: 'Diyor',
      lastName: 'Ismoilov',
    });
    playerToken = player.body.accessToken as string;

    // --- Start pulili turnir -----------------------------------------------
    const tournament = await request(t.server)
      .post('/api/v1/tournaments')
      .set(bearer(adminToken))
      .send({
        name: 'Billing sinov turniri',
        slug: 'billing-sinov-2026',
        startDate: '2026-09-01T09:00:00.000+05:00',
        endDate: '2026-09-01T18:00:00.000+05:00',
        entryFeeAmount: ENTRY_FEE_TIYIN,
      });
    expect(tournament.status).toBe(201);
    const tournamentId = tournament.body.id as string;
    // BigInt JSON'da string (ADR-0006).
    expect(tournament.body.entryFeeAmount).toBe(String(ENTRY_FEE_TIYIN));

    const section = await request(t.server)
      .post(`/api/v1/tournaments/${tournamentId}/sections`)
      .set(bearer(adminToken))
      .send({
        name: 'Asosiy guruh',
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

    const open = await request(t.server)
      .post(`/api/v1/tournaments/${tournamentId}/status`)
      .set(bearer(adminToken))
      .send({ status: 'REGISTRATION_OPEN' });
    expect(open.status).toBe(200);

    const reg = await request(t.server)
      .post(`/api/v1/sections/${sectionId}/registrations`)
      .set(bearer(playerToken))
      .send({});
    expect(reg.status).toBe(201);
    registrationId = reg.body.id as string;
  });

  afterAll(async () => {
    await t.close();
  });

  it("start pulili turnirda ro'yxat isConfirmed=false (PENDING_PAYMENT)", async () => {
    const row = await t.prisma.registration.findUniqueOrThrow({
      where: { id: registrationId },
    });
    expect(row.isConfirmed).toBe(false);
    expect(row.invoiceId).toBeNull();
  });

  it("o'yinchi invoys yaratadi → 201 FRZ-... totalAmount '5000000'", async () => {
    const res = await request(t.server)
      .post(`/api/v1/registrations/${registrationId}/invoice`)
      .set(bearer(playerToken))
      .send();
    expect(res.status).toBe(201);
    expect(res.body.number).toMatch(/^FRZ-\d{4}-\d{6}$/);
    expect(res.body.totalAmount).toBe(String(ENTRY_FEE_TIYIN));
    expect(res.body.subtotalAmount).toBe(String(ENTRY_FEE_TIYIN));
    expect(res.body.taxAmount).toBe('0');
    expect(res.body.currency).toBe('UZS');
    expect(res.body.status).toBe('CREATED');
    invoiceId = res.body.id as string;

    // Registration invoysga bog'landi (Registration.invoiceId).
    const reg = await t.prisma.registration.findUniqueOrThrow({
      where: { id: registrationId },
    });
    expect(reg.invoiceId).toBe(invoiceId);
  });

  it('ikkinchi invoys yaratish → 409 (mavjud to\'lanmagan invoys)', async () => {
    const res = await request(t.server)
      .post(`/api/v1/registrations/${registrationId}/invoice`)
      .set(bearer(playerToken))
      .send();
    expectProblem(res, 409, 'CONFLICT');
  });

  it("Idempotency-Key header'siz to'lov → 400 (docs/04 §5)", async () => {
    const res = await request(t.server)
      .post(`/api/v1/invoices/${invoiceId}/payments`)
      .set(bearer(playerToken))
      .send({ provider: 'MANUAL' });
    expectProblem(res, 400, 'IDEMPOTENCY_KEY_REQUIRED');
  });

  it("MANUAL to'lov boshlanadi → 201 CREATED", async () => {
    const res = await request(t.server)
      .post(`/api/v1/invoices/${invoiceId}/payments`)
      .set(bearer(playerToken))
      .set('Idempotency-Key', idempotencyKey)
      .send({ provider: 'MANUAL' });
    expect(res.status).toBe(201);
    expect(res.body.status).toBe('CREATED');
    expect(res.body.provider).toBe('MANUAL');
    expect(res.body.amount).toBe(String(ENTRY_FEE_TIYIN));
    expect(res.body.checkoutUrl).toBeNull(); // naqd — kassada
    paymentId = res.body.id as string;
    expect(res.body.providerTransactionId).toBe(`MANUAL-${paymentId}`);
  });

  it('REPLAY: bir xil kalit + bir xil body 5x → o\'sha to\'lov, DB\'da BITTA qator (DoD)', async () => {
    for (let i = 0; i < 5; i++) {
      const res = await request(t.server)
        .post(`/api/v1/invoices/${invoiceId}/payments`)
        .set(bearer(playerToken))
        .set('Idempotency-Key', idempotencyKey)
        .send({ provider: 'MANUAL' });
      expect(res.status).toBe(201);
      expect(res.body.id).toBe(paymentId); // operatsiya QAYTA BAJARILMADI
    }

    const count = await t.prisma.payment.count({ where: { invoiceId } });
    expect(count).toBe(1);
  });

  it('bir xil kalit + BOSHQA body → 422 IDEMPOTENCY_KEY_REUSE', async () => {
    const res = await request(t.server)
      .post(`/api/v1/invoices/${invoiceId}/payments`)
      .set(bearer(playerToken))
      .set('Idempotency-Key', idempotencyKey)
      .send({ provider: 'CLICK' });
    expectProblem(res, 422, 'IDEMPOTENCY_KEY_REUSE');
  });

  it('sozlanmagan provayder (CLICK) → 422 PROVIDER_NOT_CONFIGURED', async () => {
    const res = await request(t.server)
      .post(`/api/v1/invoices/${invoiceId}/payments`)
      .set(bearer(playerToken))
      .set('Idempotency-Key', randomUUID())
      .send({ provider: 'CLICK' });
    expectProblem(res, 422, 'PROVIDER_NOT_CONFIGURED');
  });

  it("o'yinchi confirm-manual qila OLMAYDI → 404 (Payment update — faqat SUPER)", async () => {
    const res = await request(t.server)
      .post(`/api/v1/payments/${paymentId}/confirm-manual`)
      .set(bearer(playerToken))
      .send({ reason: "O'zim tasdiqlayman" });
    // RbacGuard gate: PLAYER'da Payment 'update' yo'q → 404 siyosati.
    expect(res.status).toBe(404);
  });

  it('admin confirm-manual → PAID + invoys PAID + ro\'yxat tasdiqlandi + ledger balans', async () => {
    const res = await request(t.server)
      .post(`/api/v1/payments/${paymentId}/confirm-manual`)
      .set(bearer(adminToken))
      .send({ reason: 'Naqd to\'lov kassada qabul qilindi' });
    expect(res.status).toBe(200);
    expect(res.body.status).toBe('PAID');
    expect(res.body.paidAt).not.toBeNull();

    const invoice = await t.prisma.invoice.findUniqueOrThrow({ where: { id: invoiceId } });
    expect(invoice.status).toBe('PAID');
    expect(invoice.paidAt).not.toBeNull();

    // To'lov ro'yxatni tasdiqladi (Registration.invoiceId bog'i).
    const reg = await t.prisma.registration.findUniqueOrThrow({
      where: { id: registrationId },
    });
    expect(reg.isConfirmed).toBe(true);

    // Ledger: DR cash.manual / CR liability.organizer_payable, balans.
    const entries = await t.prisma.ledgerEntry.findMany({ where: { paymentId } });
    expect(entries).toHaveLength(2);
    const debit = entries
      .filter((e) => e.direction === 'DEBIT')
      .reduce((s, e) => s + e.amount, 0n);
    const credit = entries
      .filter((e) => e.direction === 'CREDIT')
      .reduce((s, e) => s + e.amount, 0n);
    expect(debit).toBe(BigInt(ENTRY_FEE_TIYIN));
    expect(debit).toBe(credit); // SUM(debit) === SUM(credit)
    expect(new Set(entries.map((e) => e.transactionId)).size).toBe(1);
    expect(entries.map((e) => e.account).sort()).toEqual([
      'cash.manual',
      'liability.organizer_payable',
    ]);

    // Audit — BIR tranzaksiyada yozilgan.
    const audit = await t.prisma.auditLog.findMany({
      where: { action: 'payment.succeeded', resourceId: paymentId },
    });
    expect(audit).toHaveLength(1);

    // Outbox — PaymentCompleted (ADR-0008 ro'yxati).
    const outbox = await t.prisma.outboxEvent.findMany({
      where: { eventType: 'PaymentCompleted', aggregateId: paymentId },
    });
    expect(outbox).toHaveLength(1);
  });

  it('QAYTA confirm → idempotent no-op: ledger/audit/outbox ko\'paymaydi', async () => {
    const res = await request(t.server)
      .post(`/api/v1/payments/${paymentId}/confirm-manual`)
      .set(bearer(adminToken))
      .send({ reason: 'Takroriy tasdiq (retry simulyatsiyasi)' });
    expect(res.status).toBe(200);
    expect(res.body.status).toBe('PAID');

    expect(await t.prisma.ledgerEntry.count({ where: { paymentId } })).toBe(2);
    expect(
      await t.prisma.auditLog.count({
        where: { action: 'payment.succeeded', resourceId: paymentId },
      }),
    ).toBe(1);
    expect(
      await t.prisma.outboxEvent.count({
        where: { eventType: 'PaymentCompleted', aggregateId: paymentId },
      }),
    ).toBe(1);
  });

  it('refund (sabab bilan) → REFUNDED + teskari yozuvlar, ledger BARIBIR balans', async () => {
    const res = await request(t.server)
      .post(`/api/v1/payments/${paymentId}/refund`)
      .set(bearer(adminToken))
      .send({ reason: 'Turnir tashkilotchi tomonidan bekor qilindi' });
    expect(res.status).toBe(200);
    expect(res.body.status).toBe('REFUNDED');
    expect(res.body.refundedAt).not.toBeNull();

    const invoice = await t.prisma.invoice.findUniqueOrThrow({ where: { id: invoiceId } });
    expect(invoice.status).toBe('REFUNDED');

    // Asl 2 yozuv joyida + 2 teskari yozuv = 4; umumiy balans 0.
    const entries = await t.prisma.ledgerEntry.findMany({ where: { paymentId } });
    expect(entries).toHaveLength(4);
    const debit = entries
      .filter((e) => e.direction === 'DEBIT')
      .reduce((s, e) => s + e.amount, 0n);
    const credit = entries
      .filter((e) => e.direction === 'CREDIT')
      .reduce((s, e) => s + e.amount, 0n);
    expect(debit).toBe(credit);
    // Ikki alohida tranzaksiya (asl + reversing) — asl O'ZGARMAGAN.
    expect(new Set(entries.map((e) => e.transactionId)).size).toBe(2);

    const audit = await t.prisma.auditLog.findMany({
      where: { action: 'refund.requested', resourceId: paymentId },
    });
    expect(audit).toHaveLength(1);
    expect((audit[0]!.after as { reason?: string }).reason).toBe(
      'Turnir tashkilotchi tomonidan bekor qilindi',
    );

    const outbox = await t.prisma.outboxEvent.findMany({
      where: { eventType: 'RefundIssued', aggregateId: paymentId },
    });
    expect(outbox).toHaveLength(1);
  });

  it('QAYTA refund → idempotent no-op (yozuvlar 4 ta qoladi)', async () => {
    const res = await request(t.server)
      .post(`/api/v1/payments/${paymentId}/refund`)
      .set(bearer(adminToken))
      .send({ reason: 'Takroriy refund (retry simulyatsiyasi)' });
    expect(res.status).toBe(200);
    expect(res.body.status).toBe('REFUNDED');
    expect(await t.prisma.ledgerEntry.count({ where: { paymentId } })).toBe(4);
  });

  it("reconciliation → imbalance '0' (farzin_ledger_imbalance_tiyin)", async () => {
    const res = await request(t.server)
      .get('/api/v1/billing/reconciliation')
      .set(bearer(adminToken));
    expect(res.status).toBe(200);
    expect(res.body.imbalanceTiyin).toBe('0');
    expect(res.body.balanced).toBe(true);

    const cash = (res.body.accounts as { account: string; balanceTiyin: string }[]).find(
      (a) => a.account === 'cash.manual',
    );
    // To'lov + refund → kassa balansi 0 (DR 5mln, CR 5mln).
    expect(cash?.balanceTiyin).toBe('0');
  });

  it("o'yinchi reconciliation ko'ra olmaydi → 404 (admin-scoped)", async () => {
    const res = await request(t.server)
      .get('/api/v1/billing/reconciliation')
      .set(bearer(playerToken));
    expect(res.status).toBe(404);
  });

  it("GET /invoices — o'z invoyslari (cursor pagination)", async () => {
    const res = await request(t.server).get('/api/v1/invoices').set(bearer(playerToken));
    expect(res.status).toBe(200);
    expect(res.body.items).toHaveLength(1);
    expect(res.body.items[0].id).toBe(invoiceId);
    expect(res.body.items[0].totalAmount).toBe(String(ENTRY_FEE_TIYIN));
    expect(res.body.pageInfo.hasNextPage).toBe(false);

    // Admin o'z nomiga invoys yaratmagan — ro'yxati bo'sh (own scope).
    const adminList = await request(t.server).get('/api/v1/invoices').set(bearer(adminToken));
    expect(adminList.status).toBe(200);
    expect(adminList.body.items).toHaveLength(0);
  });

  it('webhook: MANUAL provayderde webhook yo\'q → 422 (auth talab qilinmaydi)', async () => {
    const res = await request(t.server)
      .post('/api/v1/billing/webhooks/manual')
      .send({ anything: true });
    expectProblem(res, 422, 'WEBHOOK_NOT_SUPPORTED');
  });

  it('webhook: CLICK stub → 422 PROVIDER_NOT_CONFIGURED (yon ta\'sirsiz)', async () => {
    const before = await t.prisma.payment.count();
    const res = await request(t.server)
      .post('/api/v1/billing/webhooks/click')
      .send({ click_trans_id: '12345', amount: '50000' });
    expectProblem(res, 422, 'PROVIDER_NOT_CONFIGURED');
    expect(await t.prisma.payment.count()).toBe(before); // hech narsa o'zgarmadi
  });

  it("webhook: noma'lum provayder → 404", async () => {
    const res = await request(t.server)
      .post('/api/v1/billing/webhooks/bitcoin')
      .send({});
    expect(res.status).toBe(404);
  });
});
