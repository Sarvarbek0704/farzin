import 'reflect-metadata';

import { NestFactory } from '@nestjs/core';
import { Logger } from 'nestjs-pino';

import { AppModule } from './app.module';
import { AnalysisProcessor } from './modules/fairplay/analysis.processor';

/**
 * Background worker — alohida process.
 *
 * Nega API'dan ALOHIDA process:
 *
 *  1. `fairplay.analyzeGame` Stockfish NNUE ishga tushiradi — CPU'ni
 *     to'liq yeydi. API bilan bir processda bo'lsa, HTTP javob vaqti
 *     tahlil davomida buziladi.
 *
 *  2. `pairing.generate` — 500 o'yinchi uchun blossom matching sekundlar
 *     oladi va Node.js event loop'ni bloklaydi.
 *
 *  3. Mustaqil masshtablash: turnir kunida worker'lar ko'paytiriladi,
 *     API o'zgarmaydi.
 *
 * Job'lar (docs/02-architecture.md §7):
 *
 *   fairplay.analyzeGame   — Stockfish tahlili         (Faza 6)  ← FAOL
 *   pairing.generate       — juftlashtirish            (Faza 2)
 *   rating.computePeriod   — Glicko-2 davri            (Faza 3)
 *   notification.send      — SMS/push/Telegram         (Faza 1)
 *   report.export          — PDF/Excel                 (Faza 1)
 *   fide.sync              — FIDE reyting ro'yxati     (Faza 3)
 *   outbox.publish         — transactional outbox      (Faza 0)  ← ADR-0008
 *
 * ⚠️  HAR JOB IDEMPOTENT BO'LISHI SHART. BullMQ retry qiladi, tarmoq
 *     uziladi, worker yiqiladi. Ikki marta bajarilgan job natijani
 *     buzmasligi kerak. Bu talab, tavsiya emas. ADR-0008.
 */
async function bootstrap(): Promise<void> {
  // HTTP server yo'q — bu faqat worker.
  const app = await NestFactory.createApplicationContext(AppModule, { bufferLogs: true });

  const logger = app.get(Logger);
  app.useLogger(logger);

  // BullMQ job'lar tugashi uchun graceful shutdown majburiy.
  app.enableShutdownHooks();

  // fairplay navbati SHU processda qayta ishlanadi (docs/08 §8.1:
  // Stockfish CPU'ni to'liq yeydi — API processi bu Worker'ni OCHMAYDI).
  app.get(AnalysisProcessor).start();

  logger.log('Farzin worker ishga tushdi — fairplay navbati faol');
}

void bootstrap();
