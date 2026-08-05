import { Module } from '@nestjs/common';

import { IdentityModule } from '../identity/identity.module';
import { PlayerModule } from '../player/player.module';
import { BillingController } from './billing.controller';
import { BillingRepository } from './billing.repository';
import { BillingService } from './billing.service';
import { PAYMENT_PROVIDERS, type PaymentProviderAdapter } from './payment-provider.port';
import { ClickProvider } from './providers/click.provider';
import { ManualProvider } from './providers/manual.provider';
import { PaymeProvider } from './providers/payme.provider';
import { ProviderRegistry } from './providers/provider.registry';

/**
 * Billing — Faza 4 yadrosi: invoys, provider-neytral to'lov,
 * double-entry ledger, refund, reconciliation.
 * docs/09-payments-and-billing.md, docs/14-roadmap.md Faza 4.
 *
 * Provayder qo'shish tartibi (docs/09 §2.3): yangi adapter fayli +
 * QUYIDAGI ro'yxatga BITTA qator. Boshqa hech narsa o'zgarmaydi.
 *
 * Kesishmalar faqat portlar orqali (docs/02-architecture.md §6.1):
 *  - PLAYER_PORT — "ro'yxat aktorning o'zinikimi?" tekshiruvi;
 *  - Registration.invoiceId — schema darajasidagi tournament↔billing
 *    shartnomasi (billing.repository.ts izohi).
 */
@Module({
  imports: [IdentityModule, PlayerModule],
  controllers: [BillingController],
  providers: [
    BillingService,
    BillingRepository,
    ManualProvider,
    ClickProvider,
    PaymeProvider,
    {
      provide: PAYMENT_PROVIDERS,
      useFactory: (
        manual: ManualProvider,
        click: ClickProvider,
        payme: PaymeProvider,
      ): PaymentProviderAdapter[] => [manual, click, payme],
      inject: [ManualProvider, ClickProvider, PaymeProvider],
    },
    ProviderRegistry,
  ],
})
export class BillingModule {}
