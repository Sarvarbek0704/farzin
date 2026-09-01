import { NotFoundException } from '@nestjs/common';
import type { ConfigService } from '@nestjs/config';

import { NodeEnv, type AppConfig } from '../../config/configuration';
import { MetricsController } from './metrics.controller';

/**
 * /metrics scrape himoyasi — docs/AUDIT.md JIDDIY-2.
 *
 * ═══════════════════════════════════════════════════════════════════════════
 *  Controller sarlavhasi "himoya tarmoq darajasida: /metrics ingress'dan
 *  CHIQARILMAYDI" deb da'vo qilardi, lekin repoda hech qanday ingress yoki
 *  NetworkPolicy manifesti YO'Q edi. Auditda jonli tekshirildi: tokensiz
 *  `curl /metrics` → 200. Oshkor bo'ladigan ma'lumot: route inventari,
 *  so'rov hajmi, xato darajasi, faol o'yinlar, to'lov urinishlari,
 *  ledger imbalance.
 * ═══════════════════════════════════════════════════════════════════════════
 */

const TOKEN = 'audit-scrape-token-0123456789';

/** Faqat kerakli kalitlarni beradigan soxta ConfigService. */
function configWith(overrides: {
  metricsToken?: string;
  nodeEnv?: NodeEnv;
}): ConfigService<AppConfig, true> {
  const values: Record<string, unknown> = {
    metricsToken: overrides.metricsToken,
    nodeEnv: overrides.nodeEnv ?? NodeEnv.Test,
  };
  return {
    get: (key: string): unknown => values[key],
  } as unknown as ConfigService<AppConfig, true>;
}

describe('MetricsController — scrape himoyasi', () => {
  describe('METRICS_TOKEN berilgan', () => {
    /** Eksporter berilmagan → controller `# metrics exporter disabled` qaytaradi. */
    function controller(): MetricsController {
      return new MetricsController(configWith({ metricsToken: TOKEN }));
    }

    it("to'g'ri token bilan → metrika qaytadi", async () => {
      await expect(controller().scrape(`Bearer ${TOKEN}`)).resolves.toContain('disabled');
    });

    it('tokensiz → 404 (401 EMAS — endpoint mavjudligi ham oshkor qilinmaydi)', async () => {
      await expect(controller().scrape(undefined)).rejects.toThrow(NotFoundException);
    });

    it("noto'g'ri token → 404", async () => {
      await expect(controller().scrape('Bearer butunlay-boshqa-token')).rejects.toThrow(
        NotFoundException,
      );
    });

    it('`Bearer ` prefiksisiz xom token → 404', async () => {
      await expect(controller().scrape(TOKEN)).rejects.toThrow(NotFoundException);
    });

    it("to'g'ri token prefiksi bilan, lekin uzunligi boshqa → 404", async () => {
      // timingSafeEqual uzunlik farq qilsa TASHLAYDI — assertAuthorized
      // uni oldindan tekshiradi, aks holda bu holat 500 bo'lardi.
      await expect(controller().scrape(`Bearer ${TOKEN}qoshimcha`)).rejects.toThrow(
        NotFoundException,
      );
      await expect(controller().scrape('Bearer qisqa')).rejects.toThrow(NotFoundException);
    });
  });

  describe('METRICS_TOKEN berilmagan (orqaga moslik)', () => {
    it('endpoint ochiq qoladi — mavjud o`rnatmalar buzilmasin', async () => {
      const open = new MetricsController(configWith({}));
      await expect(open.scrape(undefined)).resolves.toContain('disabled');
    });
  });
});
