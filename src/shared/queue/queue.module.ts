import { Global, Module, type OnApplicationShutdown } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Queue } from 'bullmq';

import type { AppConfig } from '../../config/configuration';

/**
 * BullMQ navbat infratuzilmasi (docs/02-architecture.md §7).
 *
 * QAROR — PLAIN bullmq, @nestjs/bullmq EMAS: paket o'rnatilmagan va bitta
 * navbat uchun qo'shimcha abstraktsiya kerak emas. Producer (Queue) shu
 * yerda global provider; consumer (Worker) esa FAQAT worker processida
 * qo'lda ochiladi (src/worker.ts → AnalysisProcessor.start()) — API
 * processi og'ir CPU ishini QAYTA ISHLAMAYDI (docs/02 §7 izolyatsiya,
 * docs/08 §8.1: tahlil hech qachon HTTP so'rov ichida bajarilmaydi).
 *
 * ULANISH: BullMQ o'z ioredis ulanishini ochadi — shared REDIS client
 * ishlatilmaydi (unda maxRetriesPerRequest=3; BullMQ blocking buyruqlar
 * uchun o'z sozlamalarini talab qiladi).
 *
 * ⚠️  Kafolat at-least-once (ADR-0008) — HAR JOB IDEMPOTENT bo'lishi SHART.
 */

/** Navbatlar reestri — yangi navbat shu ro'yxatga qo'shiladi. */
export const QUEUE_NAMES = {
  fairplay: 'fairplay',
} as const;

/** BullMQ job nomi — fair-play o'yin tahlili (docs/08 §8.1). */
export const FAIRPLAY_ANALYZE_JOB = 'fairplay.analyzeGame';

/** 'fairplay' navbatining producer (Queue) tokeni. */
export const FAIRPLAY_QUEUE = Symbol('FAIRPLAY_QUEUE');

/** fairplay.analyzeGame job ma'lumoti. */
export interface FairplayAnalyzeJobData {
  gameId: string;
  /** Berilmasa — ikkala o'yinchi tahlil qilinadi. */
  playerId?: string;
}

/** Graceful shutdown — navbat ulanishi yopiladi (zombie connection yo'q). */
class QueueShutdown implements OnApplicationShutdown {
  constructor(private readonly queues: readonly Queue[]) {}

  async onApplicationShutdown(): Promise<void> {
    await Promise.all(
      this.queues.map(async (q) => {
        await q.close();
      }),
    );
  }
}

@Global()
@Module({
  providers: [
    {
      provide: FAIRPLAY_QUEUE,
      useFactory: (config: ConfigService<AppConfig, true>): Queue => {
        const redis = config.get('redis', { infer: true });
        return new Queue(QUEUE_NAMES.fairplay, {
          connection: {
            host: redis.host,
            port: redis.port,
            ...(redis.password !== undefined && { password: redis.password }),
            db: redis.db,
          },
          defaultJobOptions: {
            // At-least-once + retry: tahlil idempotent (report upsert,
            // signal dedupe) — takror bajarilish natijani buzmaydi.
            attempts: 3,
            backoff: { type: 'exponential', delay: 5_000 },
            removeOnComplete: 1_000,
            removeOnFail: 5_000,
          },
        });
      },
      inject: [ConfigService],
    },
    {
      provide: QueueShutdown,
      useFactory: (fairplay: Queue): QueueShutdown => new QueueShutdown([fairplay]),
      inject: [FAIRPLAY_QUEUE],
    },
  ],
  exports: [FAIRPLAY_QUEUE],
})
export class QueueModule {}
