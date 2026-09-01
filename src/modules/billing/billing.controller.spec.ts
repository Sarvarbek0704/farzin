import type { RawBodyRequest } from '@nestjs/common';
import type { Request } from 'express';

import { NotFoundError } from '../../core/errors/domain.error';
import { BillingController } from './billing.controller';
import type { BillingService } from './billing.service';

/**
 * Webhook — XOM body imzo yo'li (docs/AUDIT.md JIDDIY-9).
 *
 * ═══════════════════════════════════════════════════════════════════════════
 *  MUAMMO: `main.ts` da `rawBody: true` YO'Q edi va controller service'ga
 *  PARSE QILINGAN JSON uzatardi. HMAC esa bayt oqimidan hisoblanadi:
 *  `JSON.parse` → `JSON.stringify` aylanishi kalitlar tartibini,
 *  bo'shliqlarni va son formatini o'zgartiradi. Natijada to'g'ri imzo
 *  rad etilardi yoki noto'g'ri imzo qabul qilinardi — to'lov yo'qotish yo'li.
 *
 *  Stub adapterlar baribir PROVIDER_NOT_CONFIGURED tashlagani uchun bu
 *  sezilmasdi: xato real provayder ulangan KUNI chiqardi.
 *
 *  Bu test controller SHARTNOMASINI qo'riqlaydi: `req.rawBody` o'zgarishsiz
 *  o'tadi va parse qilingan body undan ALOHIDA maydonda keladi.
 * ═══════════════════════════════════════════════════════════════════════════
 */

interface CapturedWebhook {
  providerCode: string;
  rawBody: Buffer | null;
  parsedBody: unknown;
  headers: Record<string, string | string[] | undefined>;
}

function makeController(): {
  controller: BillingController;
  captured: () => CapturedWebhook | null;
} {
  let last: CapturedWebhook | null = null;
  const service = {
    webhook: (
      providerCode: string,
      input: {
        rawBody: Buffer | null;
        parsedBody: unknown;
        headers: Record<string, string | string[] | undefined>;
      },
    ): Promise<{ received: true; duplicate: boolean }> => {
      last = { providerCode, ...input };
      return Promise.resolve({ received: true as const, duplicate: false });
    },
  } as unknown as BillingService;

  return {
    controller: new BillingController(service),
    captured: (): CapturedWebhook | null => last,
  };
}

/** `rawBody` bilan soxta Express so'rovi. */
function requestWith(raw: Buffer | undefined): RawBodyRequest<Request> {
  return { rawBody: raw } as unknown as RawBodyRequest<Request>;
}

describe('BillingController — webhook xom body', () => {
  // Kalitlar tartibi va bo'shliqlar ATAYLAB "g'alati": qayta
  // serializatsiya qilinsa bu baytlar SAQLANMAYDI.
  const RAW = Buffer.from('{"b":1,  "a":"x",   "n":1.0}', 'utf8');
  const PARSED = { b: 1, a: 'x', n: 1 };

  it('xom baytlar service ga O`ZGARISHSIZ uzatiladi', async () => {
    const { controller, captured } = makeController();

    await controller.webhook('click', requestWith(RAW), PARSED, {});

    const got = captured();
    expect(got).not.toBeNull();
    expect(Buffer.isBuffer(got!.rawBody)).toBe(true);
    // Bayt-ma-bayt tenglik — ENG MUHIM da'vo.
    expect(got!.rawBody!.equals(RAW)).toBe(true);
    // Va u parse→stringify natijasi EMAS.
    expect(got!.rawBody!.toString('utf8')).not.toBe(JSON.stringify(PARSED));
  });

  it('parse qilingan body ALOHIDA maydonda keladi (imzo uchun emas)', async () => {
    const { controller, captured } = makeController();

    await controller.webhook('click', requestWith(RAW), PARSED, {});

    expect(captured()!.parsedBody).toEqual(PARSED);
  });

  it('xom body bo`lmasa → null (adapter rad etishi shart, "ehtimol to`g`ri" yo`q)', async () => {
    const { controller, captured } = makeController();

    await controller.webhook('click', requestWith(undefined), PARSED, {});

    expect(captured()!.rawBody).toBeNull();
  });

  it('sarlavhalar uzatiladi — imzo odatda shu yerda keladi', async () => {
    const { controller, captured } = makeController();

    await controller.webhook('click', requestWith(RAW), PARSED, {
      'x-signature': 'abc123',
    });

    expect(captured()!.headers['x-signature']).toBe('abc123');
  });

  it('URL segmenti provayder kodiga o`giriladi', async () => {
    const { controller, captured } = makeController();

    await controller.webhook('PayMe', requestWith(RAW), PARSED, {});

    expect(captured()!.providerCode).toBe('PAYME');
  });

  it("noma'lum provayder → NotFoundError (ro'yxat oshkor qilinmaydi)", () => {
    const { controller } = makeController();

    expect(() => controller.webhook('bitcoin', requestWith(RAW), PARSED, {})).toThrow(
      NotFoundError,
    );
  });
});
