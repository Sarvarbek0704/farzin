import { Injectable, type NestMiddleware } from '@nestjs/common';
import type { NextFunction, Request, Response } from 'express';

import { MetricsService } from './metrics.service';

/**
 * RED (Rate / Errors / Duration) — docs/15-observability.md §3.1, §3.2.
 * TZ Faza 1 DoD: "Prometheus + RED metrikalari".
 *
 * ═══════════════════════════════════════════════════════════════════════════
 *  NEGA MIDDLEWARE, INTERSEPTOR EMAS
 *
 *  NestJS'da tartib: middleware → guard → interceptor → pipe → handler.
 *  Global JwtAuthGuard/RbacGuard rad etgan so'rov (401/404) intersept
 *  qatlamiga UMUMAN yetib bormaydi — ya'ni interceptor bilan qurilgan
 *  "Errors" metrikasi eng muhim xatolarni KO'RMAYDI. `res.on('finish')`
 *  esa javob qanday tugashidan qat'i nazar ishlaydi: 404, 401, 500,
 *  validatsiya xatosi — hammasi hisoblanadi.
 *
 *  KARDINALLIK: yorliq `route` — Express'ning YO'L SHABLONI
 *  (`req.route.path` → `/api/v1/tournaments/:id`), xom URL emas
 *  (§3.2 ogohlantirishi). Shablon topilmasa `unmatched`.
 *
 *  ISTISNO: /health* va /metrics hisoblanmaydi. Sabab: ular sekundiga
 *  bir necha marta kelib availability SLI'ni (§6.3) sun'iy ravishda
 *  "yaxshilaydi" — foydalanuvchi so'rovi emas, probe.
 * ═══════════════════════════════════════════════════════════════════════════
 */
@Injectable()
export class HttpMetricsMiddleware implements NestMiddleware {
  constructor(private readonly metrics: MetricsService) {}

  use(req: Request, res: Response, next: NextFunction): void {
    const url = req.originalUrl || req.url;
    if (url.startsWith('/health') || url.startsWith('/metrics')) {
      next();
      return;
    }

    const startedAt = process.hrtime.bigint();
    res.on('finish', () => {
      const seconds = Number(process.hrtime.bigint() - startedAt) / 1e9;
      this.metrics.observeHttpRequest(seconds, {
        method: req.method,
        // `req.route` FAQAT mos kelgan so'rovda bo'ladi va u yerda yo'l
        // SHABLON ko'rinishida turadi — aynan bizga kerak narsa.
        route: (req as { route?: { path?: string } }).route?.path,
        status: res.statusCode,
      });
    });
    next();
  }
}
