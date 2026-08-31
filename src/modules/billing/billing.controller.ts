import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Headers,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
} from '@nestjs/common';
import { ApiBearerAuth, ApiHeader, ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { SkipThrottle } from '@nestjs/throttler';

import { NotFoundError } from '../../core/errors/domain.error';
import { Public } from '../../shared/auth/public.decorator';
import type { Page } from '../../shared/pagination/cursor';
import { type Actor, CurrentActor, RequirePermission } from '../identity/rbac.port';
import { BillingService } from './billing.service';
import type {
  InitiatedPayment,
  InvoiceRow,
  PaymentProviderValue,
  PaymentRow,
  ReconciliationReport,
} from './billing.types';
import { ConfirmManualPaymentDto } from './dto/confirm-manual-payment.dto';
import { InitiatePaymentDto } from './dto/initiate-payment.dto';
import { ListInvoicesQuery } from './dto/list-invoices.query';
import { RefundPaymentDto } from './dto/refund-payment.dto';

/** URL segmenti → PaymentProvider enum (schema). */
const PROVIDER_BY_PATH: Readonly<Record<string, PaymentProviderValue>> = {
  click: 'CLICK',
  payme: 'PAYME',
  uzum: 'UZUM',
  bank_transfer: 'BANK_TRANSFER',
  manual: 'MANUAL',
};

/**
 * Billing endpointlari — docs/09-payments-and-billing.md.
 *
 * Guard qatlami rol-darajali gate (@RequirePermission), scope tekshiruvi
 * service'da YUKLANGAN obyekt bilan (docs/10-security.md §3).
 */
@ApiTags('billing')
@Controller()
export class BillingController {
  constructor(private readonly billingService: BillingService) {}

  // --- Invoys ------------------------------------------------------------------

  @Post('registrations/:id/invoice')
  @HttpCode(HttpStatus.CREATED)
  @ApiBearerAuth('access-token')
  @ApiOperation({
    summary: "Ro'yxat uchun invoys — o'z ro'yxati yoki scope ichidagi mas'ul",
  })
  @ApiResponse({ status: 409, description: 'Amaldagi invoys allaqachon bor' })
  createInvoice(
    @CurrentActor() actor: Actor,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<InvoiceRow> {
    return this.billingService.createInvoiceForRegistration(actor, id);
  }

  @Get('invoices')
  @ApiBearerAuth('access-token')
  @RequirePermission('Invoice', 'read')
  @ApiOperation({ summary: "O'z invoyslari (cursor pagination)" })
  listInvoices(
    @CurrentActor() actor: Actor,
    @Query() query: ListInvoicesQuery,
  ): Promise<Page<InvoiceRow>> {
    return this.billingService.listInvoices(actor, {
      first: query.first,
      after: query.after,
    });
  }

  // --- To'lov --------------------------------------------------------------------

  @Post('invoices/:id/payments')
  @HttpCode(HttpStatus.CREATED)
  @ApiBearerAuth('access-token')
  @RequirePermission('Payment', 'create')
  @ApiHeader({
    name: 'Idempotency-Key',
    required: true,
    description: "MAJBURIY. Klient generatsiya qiladi (UUID v7), retry'da O'ZGARMAYDI",
  })
  @ApiOperation({ summary: "To'lov boshlash — Idempotency-Key MAJBURIY (docs/04 §5)" })
  @ApiResponse({ status: 400, description: "Idempotency-Key header yo'q" })
  @ApiResponse({ status: 422, description: "IDEMPOTENCY_KEY_REUSE — kalit boshqa so'rovniki" })
  initiatePayment(
    @CurrentActor() actor: Actor,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: InitiatePaymentDto,
    @Headers('idempotency-key') idempotencyKey?: string,
  ): Promise<InitiatedPayment> {
    const key = idempotencyKey?.trim();
    if (key === undefined || key === '') {
      // docs/04 §5 va docs/09 §13: header'siz to'lov so'rovi — 400.
      throw new BadRequestException({
        code: 'IDEMPOTENCY_KEY_REQUIRED',
        errors: [
          {
            field: 'Idempotency-Key',
            code: 'HEADER_REQUIRED',
            message: 'Idempotency-Key header majburiy (docs/04-api-spec.md §5)',
          },
        ],
      });
    }
    return this.billingService.initiatePayment(actor, id, dto.provider, key);
  }

  @Post('payments/:id/confirm-manual')
  @HttpCode(HttpStatus.OK)
  @ApiBearerAuth('access-token')
  @RequirePermission('Payment', 'update')
  @ApiOperation({
    summary: "Naqd (MANUAL) to'lovni tasdiqlash — sabab majburiy, idempotent",
  })
  confirmManual(
    @CurrentActor() actor: Actor,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: ConfirmManualPaymentDto,
  ): Promise<PaymentRow> {
    return this.billingService.confirmManualPayment(actor, id, dto.reason);
  }

  /**
   * Provayder webhook'i.
   *
   * @Public — provayder chaqiradi, JWT yo'q; haqiqiylik IMZO bilan
   * (adapter verifyWebhook). docs/09 §1.3.
   *
   * @SkipThrottle — webhook'da rate limit YO'Q (docs/10-security.md §7.1
   * jadvali: provayder retry'ini bloklash = to'lov yo'qotish).
   *
   * TODO(billing): real provayder ulanganda imzo XOM body ustidan
   * tekshirilishi kerak — main.ts'da NestFactory.create(..., { rawBody:
   * true }) yoqiladi va bu yerga RawBodyRequest keladi (docs/09 §10.2).
   * Hozircha parse qilingan JSON uzatiladi; stub adapterlar baribir
   * PROVIDER_NOT_CONFIGURED tashlaydi.
   */
  @Public()
  @SkipThrottle()
  @Post('billing/webhooks/:provider')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: "Provayder webhook (imzo adapter'da tekshiriladi)" })
  webhook(
    @Param('provider') provider: string,
    @Body() body: unknown,
    @Headers() headers: Record<string, string | string[] | undefined>,
  ): Promise<{ received: true; duplicate: boolean }> {
    const code = PROVIDER_BY_PATH[provider.toLowerCase()];
    if (code === undefined) {
      // Noma'lum provayder segmenti — 404, ro'yxat oshkor qilinmaydi.
      throw new NotFoundError('PaymentProvider', provider);
    }
    return this.billingService.webhook(code, body, headers);
  }

  @Post('payments/:id/refund')
  @HttpCode(HttpStatus.OK)
  @ApiBearerAuth('access-token')
  @RequirePermission('Payment', 'update')
  @ApiOperation({ summary: "Refund — sabab majburiy, ledger'da teskari yozuv" })
  refund(
    @CurrentActor() actor: Actor,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: RefundPaymentDto,
  ): Promise<PaymentRow> {
    return this.billingService.refund(actor, id, dto.reason);
  }

  // --- Reconciliation -------------------------------------------------------------

  @Get('billing/reconciliation')
  @ApiBearerAuth('access-token')
  @RequirePermission('Payment', 'read')
  @ApiOperation({
    summary: 'Ledger yaxlitligi hisoboti — imbalance HAR DOIM 0 (docs/09 §11.4)',
  })
  reconciliation(@CurrentActor() actor: Actor): Promise<ReconciliationReport> {
    return this.billingService.reconciliationReport(actor);
  }
}
