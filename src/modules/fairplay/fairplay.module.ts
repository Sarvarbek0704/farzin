import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

import type { AppConfig } from '../../config/configuration';
import { IdentityModule } from '../identity/identity.module';
import { PlayerModule } from '../player/player.module';
import { AnalysisProcessor } from './analysis.processor';
import { StockfishUciAdapter } from './engine/stockfish-uci.adapter';
import { ANALYSIS_ENGINE, type AnalysisEngine } from './engine/uci-engine.port';
import { FairplayController } from './fairplay.controller';
import { FairplayListener } from './fairplay.listener';
import { FairplayRepository } from './fairplay.repository';
import { FairplayService } from './fairplay.service';

/**
 * Fairplay — Faza 6: tahlil navbati, vaqt fingerprint, engine
 * korrelyatsiya (config-gated), komissiya ishi, apellyatsiya.
 * docs/08-fair-play.md, docs/14-roadmap.md Faza 6.
 *
 * ═══════════════════════════════════════════════════════════════════════════
 *  ENG MUHIM DIZAYN QOIDASI (docs/08 §0, §4.1; CANON §7.5):
 *  BU MODUL EHTIMOLLIK ISHLAB CHIQARADI, ISBOT EMAS. AVTOMATIK JAZO YO'Q.
 *
 *  Signal → skor → ish (OPEN) zanjiri faqat KO'RINISH beradi. Sanksiya
 *  o'rnatadigan yagona kod yo'li — FairplayService.decideCase: odam
 *  aktori + majburiy yozma asos + audit ('fairplay.decision',
 *  REASON_REQUIRED) + apellyatsiya huquqi. Bu invariant integration
 *  test bilan tasdiqlangan (docs/14 Faza 6 DoD).
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * ENGINE GATING (billing provider pattern'i): STOCKFISH_PATH yo'q →
 * ANALYSIS_ENGINE = null → korrelyatsiya toza o'chirilgan, vaqt tahlili
 * ishlayveradi. Binary bor muhitda hech qanday kod o'zgarmaydi.
 *
 * PROCESSLAR: API processi faqat PRODUCER (navbatga yozadi); BullMQ
 * Worker FAQAT worker processida ochiladi (src/worker.ts →
 * AnalysisProcessor.start()) — Stockfish CPU'si HTTP'ni bo'g'masin
 * (docs/02 §7).
 */
@Module({
  imports: [IdentityModule, PlayerModule],
  controllers: [FairplayController],
  providers: [
    FairplayService,
    FairplayRepository,
    FairplayListener,
    AnalysisProcessor,
    {
      provide: ANALYSIS_ENGINE,
      useFactory: (config: ConfigService<AppConfig, true>): AnalysisEngine | null => {
        const path = config.get('fairplay', { infer: true }).stockfishPath;
        return path === null ? null : new StockfishUciAdapter(path);
      },
      inject: [ConfigService],
    },
  ],
})
export class FairplayModule {}
