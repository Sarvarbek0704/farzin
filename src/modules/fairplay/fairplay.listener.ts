import { Inject, Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { OnEvent } from '@nestjs/event-emitter';
import { Queue } from 'bullmq';

import type { AppConfig } from '../../config/configuration';
import {
  FAIRPLAY_ANALYZE_JOB,
  FAIRPLAY_QUEUE,
  type FairplayAnalyzeJobData,
} from '../../shared/queue/queue.module';
import { PLAY_GAME_FINISHED_EVENT, type PlayGameFinishedEvent } from '../play/play.types';

/**
 * TANLAB tahlil triggeri (docs/08 §8.2, docs/14 Faza 6: "hamma o'yin
 * EMAS — iqtisodiy cheklov"): reytingli onlayn o'yin tugashi →
 * ehtimoliy sampling (FAIRPLAY_SAMPLING_RATE) → navbatga.
 *
 * TRANSPORT TANLOVI — EventEmitter2, outbox EMAS (ADR-0008 jadvali):
 * "event yo'qolsa pul/natija/huquq zarar ko'radimi?" — YO'Q: bitta
 * o'yin tahlili yo'qolishi katastrofik emas, sampling baribir tasodifiy
 * tanlaydi. Ish OCHILISHI esa (huquqqa tegadigan qadam) allaqachon
 * outbox'da ('FairPlayCaseOpened', fairplay.repository).
 *
 * Navbatga yozish yiqilsa (Redis yo'q) — warn + davom: o'yin oqimini
 * fair-play hech qachon bloklamaydi (docs/08 §10: tahlil asinxron).
 */
@Injectable()
export class FairplayListener {
  private readonly logger = new Logger(FairplayListener.name);

  constructor(
    @Inject(FAIRPLAY_QUEUE) private readonly queue: Queue,
    private readonly config: ConfigService<AppConfig, true>,
  ) {}

  @OnEvent(PLAY_GAME_FINISHED_EVENT)
  async onGameFinished(event: PlayGameFinishedEvent): Promise<void> {
    if (!event.isRated) {
      return; // do'stona o'yin — reyting ham, tahlil ham yo'q
    }
    if (event.status === 'ABORTED' || event.status === 'ABANDONED') {
      return; // o'ynalmagan/yarim o'yin — statistik ma'nosiz
    }
    const rate = this.config.get('fairplay', { infer: true }).samplingRate;
    if (Math.random() >= rate) {
      return; // sampling — tanlab tahlil (docs/08 §8.2)
    }
    try {
      const data: FairplayAnalyzeJobData = { gameId: event.gameId };
      await this.queue.add(FAIRPLAY_ANALYZE_JOB, data, {
        jobId: `analyze:${event.gameId}:all`,
      });
    } catch (e) {
      this.logger.warn(
        `fairplay navbatga yozilmadi (game=${event.gameId}): ${e instanceof Error ? e.message : String(e)}`,
      );
    }
  }
}
