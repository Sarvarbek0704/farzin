import { Module } from '@nestjs/common';

import { IdentityModule } from '../identity/identity.module';
import { PLAYER_PORT } from './player.port';
import { PlayerController } from './player.controller';
import { PlayerRepository } from './player.repository';
import { PlayerService } from './player.service';

/**
 * Player — o'yinchi profili. [CANON 5] #2.
 *
 * Boshqa modullar PLAYER_PORT orqali ishlaydi (docs/02-architecture.md §6.1).
 */
@Module({
  imports: [IdentityModule],
  controllers: [PlayerController],
  providers: [
    PlayerService,
    PlayerRepository,
    { provide: PLAYER_PORT, useExisting: PlayerService },
  ],
  exports: [PLAYER_PORT],
})
export class PlayerModule {}
