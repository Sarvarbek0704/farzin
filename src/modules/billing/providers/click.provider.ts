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
 * Click adapter — STUB. Real sandbox hisob ma'lumotlari YO'Q.
 *
 * TODO(billing): implementatsiyadan OLDIN majburiy shartlar:
 *  1. Click merchant ro'yxati + SANDBOX hisob ma'lumotlari (merchant_id,
 *     service_id, secret_key) — docs.click.uz orqali olinadi
 *     (docs/09-payments-and-billing.md §1.4: test kartalar HUJJATDAN
 *     olinadi, TO'QILMAYDI).
 *  2. Webhook imzo tekshiruvi — AYNAN docs.click.uz spetsifikatsiyasi
 *     bo'yicha (Click SHOP API: prepare/complete, sign_string). Imzo
 *     formulasi BU YERDA O'YLAB TOPILMAYDI. Qat'iy qoidalar
 *     (docs/09 §2.4, §10.2, provayderdan mustaqil):
 *       - imzo XOM body baytlari ustidan (rawBody: Buffer), qayta
 *         serializatsiya qilingan obyekt ustidan EMAS;
 *       - taqqoslash timing-safe (crypto.timingSafeEqual);
 *       - mos kelmasa — throw, "ehtimol to'g'ri" yo'li YO'Q.
 *  3. Ack formati — Click JSON javob kutadi (error/error_note maydonlari);
 *     aniq shakl docs.click.uz dan tekshiriladi (docs/09 §1.3 4-band).
 *  4. main.ts: NestFactory.create(..., { rawBody: true }) — imzo uchun
 *     xom body kerak bo'ladi (docs/09 §2.2 WebhookRequest.rawBody).
 *  5. Reconciliation: settlement hisobot formati (fayl/API) —
 *     docs.click.uz dan tekshiriladi (docs/09 §11.2).
 *
 * Shu shartlar bajarilmaguncha adapter PROVIDER_NOT_CONFIGURED tashlaydi —
 * `configured = false` esa to'lov boshlanishidan OLDIN rad etadi.
 */
@Injectable()
export class ClickProvider implements PaymentProviderAdapter {
  readonly code = 'CLICK' as const;
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
      'Click provayderi hali sozlanmagan: sandbox hisob ma\'lumotlari va ' +
        'merchant ro\'yxati kerak (docs.click.uz). docs/09 §1.4, §2.4',
      { provider: this.code, operation },
    );
  }
}
