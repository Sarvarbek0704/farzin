import { Injectable } from '@nestjs/common';

import { BusinessRuleError } from '../../../core/errors/domain.error';
import type {
  CheckoutInput,
  CheckoutResult,
  NormalizedWebhookEvent,
  PaymentProviderAdapter,
  ProviderRefundResult,
  RefundInput,
  WebhookVerifyInput,
} from '../payment-provider.port';

/**
 * Payme adapter — STUB. Real sandbox hisob ma'lumotlari YO'Q.
 *
 * TODO(billing): implementatsiyadan OLDIN majburiy shartlar:
 *  1. Payme (Paycom) merchant ro'yxati + sandbox KASSA hisob ma'lumotlari
 *     (merchant id, key) — developer.help.paycom.uz orqali
 *     (docs/09-payments-and-billing.md §2.4: Payme tekshirish manbai).
 *  2. Payme Merchant API — JSON-RPC 2.0 uslubida (CheckPerformTransaction,
 *     CreateTransaction, PerformTransaction, CancelTransaction, ...).
 *     Autentifikatsiya HTTP Basic (Authorization header, kassa paroli) —
 *     aniq tafsilot developer.help.paycom.uz dan TEKSHIRILADI,
 *     BU YERDA O'YLAB TOPILMAYDI (docs/09 §1.3 4-band).
 *     Qat'iy qoidalar (provayderdan mustaqil, docs/09 §2.4, §10.2):
 *       - tekshiruv XOM body ustidan (rawBody: Buffer);
 *       - sirlarni taqqoslash timing-safe;
 *       - mos kelmasa — throw, yon ta'sirsiz 401.
 *  3. Ack formati — Payme JSON-RPC shaklidagi javob kutadi
 *     ({ result } / { error: { code, message } }); aniq kodlar jadvali
 *     developer.help.paycom.uz dan olinadi.
 *  4. main.ts: NestFactory.create(..., { rawBody: true }).
 *  5. Reconciliation: GetStatement metodi (davr bo'yicha tranzaksiyalar) —
 *     docs/09 §11.2 kunlik job manbai; tekshiriladi.
 *
 * Shu shartlar bajarilmaguncha adapter PROVIDER_NOT_CONFIGURED tashlaydi —
 * `configured = false` esa to'lov boshlanishidan OLDIN rad etadi.
 */
@Injectable()
export class PaymeProvider implements PaymentProviderAdapter {
  readonly code = 'PAYME' as const;
  readonly configured = false;

  createCheckout(_input: CheckoutInput): Promise<CheckoutResult> {
    return Promise.reject(this.notConfigured('createCheckout'));
  }

  verifyWebhook(_input: WebhookVerifyInput): Promise<NormalizedWebhookEvent> {
    return Promise.reject(this.notConfigured('verifyWebhook'));
  }

  refund(_input: RefundInput): Promise<ProviderRefundResult> {
    return Promise.reject(this.notConfigured('refund'));
  }

  private notConfigured(operation: string): BusinessRuleError {
    return new BusinessRuleError(
      'PROVIDER_NOT_CONFIGURED',
      "Payme provayderi hali sozlanmagan: sandbox kassa hisob ma'lumotlari " +
        "va merchant ro'yxati kerak (developer.help.paycom.uz). docs/09 §1.4, §2.4",
      { provider: this.code, operation },
    );
  }
}
