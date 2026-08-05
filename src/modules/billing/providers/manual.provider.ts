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
 * MANUAL provayder — naqd to'lov, hakam/admin API orqali tasdiqlaydi.
 * TO'LIQ ISHLAYDI: tashqi chaqiruv yo'q, sandbox kerak emas.
 *
 * Oqim (docs/09-payments-and-billing.md §7.2 bank/naqd analogi):
 *  1. o'yinchi invoys yaratadi va MANUAL to'lov boshlaydi (CREATED);
 *  2. kassada naqd to'laydi;
 *  3. admin `POST /payments/:id/confirm-manual` bilan tasdiqlaydi —
 *     applyPaymentSuccess (billing.repository.ts) PAID + ledger yozadi.
 *
 * Webhook YO'Q — naqd pulda provayder-server yo'q; tasdiq API harakati
 * va u AuditLog'da (kim, qachon, sabab).
 */
@Injectable()
export class ManualProvider implements PaymentProviderAdapter {
  readonly code = 'MANUAL' as const;
  readonly configured = true;

  createCheckout(input: CheckoutInput): Promise<CheckoutResult> {
    // Checkout URL yo'q — to'lov kassada. providerRef deterministik:
    // Payment ID'dan, unique [provider, providerTransactionId] ga mos.
    return Promise.resolve({
      providerRef: `MANUAL-${input.paymentId}`,
      checkoutUrl: null,
    });
  }

  verifyWebhook(_input: WebhookVerifyInput): Promise<NormalizedWebhookEvent> {
    // Naqd to'lovda webhook bo'lmaydi — kelgan bo'lsa, bu xato so'rov.
    return Promise.reject(
      new BusinessRuleError(
        'WEBHOOK_NOT_SUPPORTED',
        "MANUAL provayderde webhook yo'q — tasdiq faqat confirm-manual API orqali",
        { provider: this.code },
      ),
    );
  }

  refund(_input: RefundInput): Promise<ProviderRefundResult> {
    // Naqd qaytarish — tashqi chaqiruvsiz, darhol qabul qilinadi.
    // Pul harakati ledger'dagi teskari yozuvda aks etadi (docs/09 §8.2).
    return Promise.resolve({ accepted: true, providerRefundRef: null });
  }
}
