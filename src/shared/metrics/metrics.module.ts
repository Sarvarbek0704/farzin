import {
  Global,
  Inject,
  Module,
  RequestMethod,
  type MiddlewareConsumer,
  type NestModule,
  type OnApplicationBootstrap,
  type OnApplicationShutdown,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrometheusExporter } from '@opentelemetry/exporter-prometheus';
import { metrics as otelMetrics, resources as otelResources } from '@opentelemetry/sdk-node';

import type { AppConfig } from '../../config/configuration';
import { HttpMetricsMiddleware } from './http-metrics.middleware';
import { MetricsController } from './metrics.controller';
import { MetricsService } from './metrics.service';
import { METRICS_EXPORTER, METRICS_METER, METRICS_METER_PROVIDER } from './metrics.tokens';

/**
 * ═══════════════════════════════════════════════════════════════════════════
 *  KUZATUVCHANLIK — METRIKA QATLAMI (docs/15-observability.md §3)
 *
 *  QAROR 1 — OpenTelemetry, prom-client emas.
 *  Hujjatning §3.2/§3.3 kod misollari `prom-client` bilan yozilgan, lekin
 *  §4 (tracing) OpenTelemetry'ni talab qiladi va `@opentelemetry/*`
 *  paketlari allaqachon bog'liqlikda. Ikki xil telemetriya kutubxonasini
 *  bir processda saqlash — ikki xil registr, ikki xil resurs atributi va
 *  metrika↔trace bog'lanishining yo'qolishi. Shuning uchun metrika ham
 *  OTel SDK'da; NOMLAR, YORLIQLAR va BUCKET'lar hujjatdan AYNAN olingan
 *  (Prometheus eksporteri counter nomiga `_total` qo'shadi — nomlarimiz
 *  allaqachon shu bilan tugagani uchun ikkilanish bo'lmaydi).
 *
 *  QAROR 2 — metrika HAR DOIM YOQIQ, `OTEL_ENABLED` esa TRACING'ni
 *  boshqaradi. Sabab: metrika arzon (bir necha yuz seriya, tashqi tarmoq
 *  chaqiruvi yo'q) va u ayni "tizim jimgina buzilganda" kerak bo'ladi.
 *  Trace esa qimmat (§1 jadvali) va tashqi kollektor talab qiladi —
 *  o'chirilgan bo'lishi normal. `OTEL_ENABLED` shu sababli bu modulda
 *  ISHLATILMAYDI; u §4 tracing bosqichining bayrog'i bo'lib qoladi.
 *  Metrikani butunlay o'chirish kerak bo'lsa — `METRICS_METER` provayderi
 *  berilmaydi va MetricsService o'zi no-op bo'ladi (metrics.service.ts).
 *
 *  QAROR 3 — @Global. MetricsService o'nlab modulda kerak; har birida
 *  `imports: [MetricsModule]` yozish shovqin. Bu AuditModule/PrismaModule
 *  bilan bir xil naqsh.
 * ═══════════════════════════════════════════════════════════════════════════
 */
@Global()
@Module({
  controllers: [MetricsController],
  providers: [
    {
      provide: METRICS_EXPORTER,
      useFactory: (): PrometheusExporter =>
        new PrometheusExporter({
          // Alohida port OCHILMAYDI — metrics.controller.ts izohiga qarang.
          preventServerStart: true,
          // Prometheus scrape vaqtini o'zi qo'yadi; eksporter timestamp'i
          // faqat chalkashtiradi (va federate'da muammo beradi).
          appendTimestamp: false,
        }),
    },
    {
      provide: METRICS_METER_PROVIDER,
      inject: [METRICS_EXPORTER, ConfigService],
      useFactory: (
        exporter: PrometheusExporter,
        config: ConfigService<AppConfig, true>,
      ): otelMetrics.MeterProvider =>
        new otelMetrics.MeterProvider({
          // Resurs atributlari `target_info` metrikasida chiqadi va
          // Grafana'da service bo'yicha filtrlashni beradi (§4.2 bilan
          // bir xil qiymatlar — trace va metrika bir servisga tegishli).
          resource: new otelResources.Resource({
            'service.name': 'farzin-api',
            'service.version': process.env.APP_VERSION ?? '0.1.0',
            'deployment.environment': config.get('nodeEnv', { infer: true }),
          }),
          readers: [exporter],
        }),
    },
    {
      provide: METRICS_METER,
      inject: [METRICS_METER_PROVIDER],
      useFactory: (provider: otelMetrics.MeterProvider) => provider.getMeter('farzin'),
    },
    MetricsService,
    HttpMetricsMiddleware,
  ],
  exports: [MetricsService],
})
export class MetricsModule implements NestModule, OnApplicationBootstrap, OnApplicationShutdown {
  constructor(
    @Inject(METRICS_METER_PROVIDER) private readonly provider: otelMetrics.MeterProvider,
    private readonly metrics: MetricsService,
  ) {}

  configure(consumer: MiddlewareConsumer): void {
    // Barcha yo'llar — RED metrikasi guard rad etgan so'rovni ham ko'rishi
    // shart (http-metrics.middleware.ts izohi). `'*'` naqshi NestJS 11
    // tomonidan Express 5 uchun ham qo'llab-quvvatlanadi (nestjs-pino
    // ham aynan shuni ishlatadi).
    consumer.apply(HttpMetricsMiddleware).forRoutes({ path: '*', method: RequestMethod.ALL });
  }

  onApplicationBootstrap(): void {
    this.metrics.primeZeroSeries();
  }

  async onApplicationShutdown(): Promise<void> {
    // Provider yopilmasa jest process'i ochiq handle bilan qoladi va
    // integration suite'lar bir-birining registriga yozadi.
    await this.provider.shutdown();
  }
}
