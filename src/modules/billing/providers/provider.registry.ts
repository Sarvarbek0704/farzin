import { Inject, Injectable } from '@nestjs/common';

import { BusinessRuleError } from '../../../core/errors/domain.error';
import type { PaymentProviderValue } from '../billing.types';
import { PAYMENT_PROVIDERS, type PaymentProviderAdapter } from '../payment-provider.port';

/**
 * Provayder reestri — kod → adapter (docs/09-payments-and-billing.md §2.3).
 *
 * Yangi provayder qo'shish = 1 yangi adapter fayli + billing.module.ts
 * DI ro'yxatiga 1 qator. BOSHQA HECH NARSA o'zgarmaydi — bu
 * abstraksiyaning yagona o'lchov mezoni (docs/09 §2.3).
 */
@Injectable()
export class ProviderRegistry {
  private readonly byCode: ReadonlyMap<PaymentProviderValue, PaymentProviderAdapter>;

  constructor(@Inject(PAYMENT_PROVIDERS) adapters: readonly PaymentProviderAdapter[]) {
    const map = new Map<PaymentProviderValue, PaymentProviderAdapter>();
    for (const adapter of adapters) {
      if (map.has(adapter.code)) {
        // Konfiguratsiya bugi — ilova ishga tushmasin (fail fast).
        throw new Error(`Takroriy to'lov provayderi: ${adapter.code}`);
      }
      map.set(adapter.code, adapter);
    }
    this.byCode = map;
  }

  get(code: PaymentProviderValue): PaymentProviderAdapter {
    const adapter = this.byCode.get(code);
    if (adapter === undefined) {
      throw new BusinessRuleError(
        'PROVIDER_NOT_AVAILABLE',
        `To'lov provayderi mavjud emas: ${code}`,
        { provider: code },
      );
    }
    return adapter;
  }

  has(code: PaymentProviderValue): boolean {
    return this.byCode.has(code);
  }
}
