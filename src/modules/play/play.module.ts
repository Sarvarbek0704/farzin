import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtModule } from '@nestjs/jwt';

import type { AppConfig } from '../../config/configuration';
import { IdentityModule } from '../identity/identity.module';
import { PlayerModule } from '../player/player.module';
import { RatingModule } from '../rating/rating.module';
import { ClockStore } from './clock.store';
import { GameTimers } from './game-timers';
import { MatchmakingService } from './matchmaking.service';
import { PlayController } from './play.controller';
import { PlayGateway } from './play.gateway';
import { PlayRepository } from './play.repository';
import { PlayService } from './play.service';

/**
 * Play — onlayn o'yin: server-authoritative soat, server tomonda yurish
 * validatsiyasi, Socket.IO gateway, oddiy matchmaking. [CANON 5] #8.
 *
 * Bog'liqliklar (faqat portlar orqali, docs/02-architecture.md §6.1):
 *  - PLAYER_PORT — userId ↔ playerId, ism/unvon;
 *  - RATING_PORT — matchmaking oynasi va displey reytingi.
 *
 * JwtModule: IdentityModule JwtModule'ni eksport qilmaydi — gateway
 * handshake'i uchun AYNI konfiguratsiya (accessSecret, HS256) bilan
 * o'zimizniki ro'yxatga olinadi (play.gateway.ts hujjatiga qarang).
 *
 * @see docs/07-realtime-and-clock.md
 * @see docs/14-roadmap.md — Faza 5
 */
@Module({
  imports: [
    IdentityModule,
    PlayerModule,
    RatingModule,
    JwtModule.registerAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService<AppConfig, true>) => {
        const jwt = config.get('jwt', { infer: true });
        return {
          secret: jwt.accessSecret,
          verifyOptions: { algorithms: ['HS256' as const] },
        };
      },
    }),
  ],
  controllers: [PlayController],
  providers: [PlayService, PlayRepository, ClockStore, GameTimers, MatchmakingService, PlayGateway],
})
export class PlayModule {}
