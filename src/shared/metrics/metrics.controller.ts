import { timingSafeEqual } from 'node:crypto';

import {
  Controller,
  Get,
  Header,
  Headers,
  Inject,
  Logger,
  NotFoundException,
  Optional,
  VERSION_NEUTRAL,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrometheusSerializer, type PrometheusExporter } from '@opentelemetry/exporter-prometheus';
import { ApiExcludeController } from '@nestjs/swagger';

import { type AppConfig, NodeEnv } from '../../config/configuration';
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
 *   - @Public — JwtAuthGuard bu yo'lni tekshirmaydi (Prometheus JWT
 *     ko'tarmaydi va yangilay olmaydi). Buning O'RNIGA `METRICS_TOKEN`
 *     bilan bearer tekshiruvi — assertAuthorized() ga qarang.
 *
 *     ⚠️  Ilgari bu yerda "himoya tarmoq darajasida: /metrics
 *         ingress'dan CHIQARILMAYDI" deb yozilgan edi, lekin repoda
 *         hech qanday ingress/NetworkPolicy manifesti YO'Q edi va
 *         endpoint tokensiz 200 qaytarardi (docs/AUDIT.md JIDDIY-2).
 *         Endi da'vo kod bilan ta'minlangan; tarmoq himoyasi esa
 *         qo'shimcha qatlam bo'lib qoladi, YAGONA qatlam emas.
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

  /**
   * Scrape tokeni (`METRICS_TOKEN`). `null` = himoya YO'Q.
   *
   * Doimiy vaqtli taqqoslash uchun oldindan bayt shakliga keltiriladi.
   */
  private readonly expectedToken: Buffer | null;

  constructor(
    config: ConfigService<AppConfig, true>,
    @Optional() @Inject(METRICS_EXPORTER) private readonly exporter?: PrometheusExporter,
  ) {
    const token = config.get('metricsToken', { infer: true });
    this.expectedToken = token === undefined ? null : Buffer.from(token, 'utf8');

    if (this.expectedToken === null) {
      // Bir marta, ishga tushishda — "nega /metrics ochiq?" savoliga javob.
      const level = config.get('nodeEnv', { infer: true }) === NodeEnv.Production ? 'warn' : 'log';
      this.logger[level](
        'METRICS_TOKEN berilmagan — /metrics AUTENTIFIKATSIYASIZ ochiq. ' +
          'Himoya faqat tarmoq darajasida bo`ladi.',
      );
    }
  }

  @Get()
  @Header('Content-Type', 'text/plain; version=0.0.4; charset=utf-8')
  @Header('Cache-Control', 'no-store')
  async scrape(@Headers('authorization') authorization?: string): Promise<string> {
    this.assertAuthorized(authorization);

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

  /**
   * Bearer token tekshiruvi.
   *
   * ═══════════════════════════════════════════════════════════════════════
   *  NEGA JWT EMAS: Prometheus JWT ololmaydi va yangilay olmaydi. U
   *  `bearer_token_file` ni qo'llab-quvvatlaydi — ya'ni O'ZGARMAS sir.
   *  Shu sababli bu yerda oddiy umumiy sir ishlatiladi, JwtAuthGuard emas
   *  (controller @Public bo'lib qoladi).
   *
   *  DOIMIY VAQTLI taqqoslash: `===` sirni belgima-belgi solishtiradi va
   *  javob vaqti orqali uni bit-ma-bit topish mumkin edi.
   *
   *  Token BERILMASA — endpoint ochiq qoladi (orqaga moslik: mavjud
   *  o'rnatmalar buzilmasin). Bu holat ishga tushishda log'ga chiqadi,
   *  prod'da WARN darajasida.
   * ═══════════════════════════════════════════════════════════════════════
   */
  private assertAuthorized(authorization: string | undefined): void {
    if (this.expectedToken === null) {
      return;
    }

    const prefix = 'Bearer ';
    const header = authorization ?? '';
    const provided = header.startsWith(prefix)
      ? Buffer.from(header.slice(prefix.length), 'utf8')
      : Buffer.alloc(0);

    // `timingSafeEqual` uzunliklar farq qilsa TASHLAYDI — avval uzunlik
    // tekshiriladi. Uzunlik sizib chiqishi qabul qilingan: u sirning
    // o'zini bermaydi.
    const ok =
      provided.length === this.expectedToken.length &&
      timingSafeEqual(provided, this.expectedToken);

    if (!ok) {
      // 404, 401 EMAS: endpoint mavjudligini ham oshkor qilmaymiz
      // (docs/04-api-spec.md §2.4 dagi bir xil tamoyil).
      throw new NotFoundException();
    }
  }
}
