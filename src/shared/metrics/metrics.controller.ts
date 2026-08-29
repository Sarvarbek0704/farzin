import { Controller, Get, Header, Inject, Logger, Optional, VERSION_NEUTRAL } from '@nestjs/common';
import { PrometheusSerializer, type PrometheusExporter } from '@opentelemetry/exporter-prometheus';
import { ApiExcludeController } from '@nestjs/swagger';

import { Public } from '../auth/public.decorator';
import { METRICS_EXPORTER } from './metrics.tokens';

/**
 * Prometheus scrape endpoint — GET /metrics.
 *
 * ═══════════════════════════════════════════════════════════════════════════
 *  NEGA BITTA PORT (hujjatlangan qaror)
 *
 *  `@opentelemetry/exporter-prometheus` odatda O'Z HTTP serverini ochadi
 *  (9464-port). Bu yerda u `preventServerStart: true` bilan yaratiladi va
 *  metrikalar SHU controller orqali beriladi. Sabab:
 *
 *   - Kubernetes bitta konteynerdan bitta portni scrape qiladi; ikkinchi
 *     port = ikkinchi Service/ServicePort/NetworkPolicy = ortiqcha yuk;
 *   - /metrics ham qolgan hamma narsa kabi helmet, CORS va shutdown
 *     hook'lari ostida bo'ladi;
 *   - testda supertest bilan oddiy tekshiriladi (alohida port kutish yo'q).
 *
 *  Narxi: metrikalar HTTP so'rov ipida serializatsiya qilinadi. Scrape
 *  15 soniyada bir marta va serializatsiya millisekundlar oladi — bu
 *  qabul qilingan trade-off.
 *
 *  QOIDALAR:
 *   - @Public — scrape'da token yo'q (K8s/Prometheus JWT ko'tarmaydi).
 *     Himoya tarmoq darajasida: /metrics ingress'dan CHIQARILMAYDI,
 *     faqat cluster ichidan ochiq (docs/11-infrastructure.md).
 *   - VERSION_NEUTRAL + global prefiksdan chiqarilgan → yo'l aynan
 *     `/metrics` (health kabi; `/api/v1/metrics` bo'lib qolmasin).
 *   - pino autoLogging bu yo'lni E'TIBORSIZ qoldiradi (app.module.ts),
 *     aks holda har 15 soniyada log qatori — docs/15 §2.2.
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * @see docs/15-observability.md §3
 */
@ApiExcludeController()
@Public()
@Controller({ path: 'metrics', version: VERSION_NEUTRAL })
export class MetricsController {
  private readonly logger = new Logger(MetricsController.name);

  /** OpenMetrics emas — klassik Prometheus text exposition format. */
  private readonly serializer = new PrometheusSerializer(undefined, false);

  constructor(
    @Optional() @Inject(METRICS_EXPORTER) private readonly exporter?: PrometheusExporter,
  ) {}

  @Get()
  @Header('Content-Type', 'text/plain; version=0.0.4; charset=utf-8')
  @Header('Cache-Control', 'no-store')
  async scrape(): Promise<string> {
    if (this.exporter === undefined) {
      return '# metrics exporter disabled\n';
    }
    const { resourceMetrics, errors } = await this.exporter.collect();
    if (errors.length > 0) {
      // Yig'ish xatosi scrape'ni YIQITMAYDI — qolgan metrikalar baribir
      // beriladi (qisman ma'lumot — ma'lumotsizlikdan afzal).
      this.logger.warn(`Metrika yig'ishda ${String(errors.length)} xato`);
    }
    return this.serializer.serialize(resourceMetrics);
  }
}
