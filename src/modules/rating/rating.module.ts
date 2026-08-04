import { Module } from '@nestjs/common';

import { IdentityModule } from '../identity/identity.module';
import { RatingController } from './rating.controller';
import { RATING_PORT } from './rating.port';
import { RatingRepository } from './rating.repository';
import { RatingService } from './rating.service';

/**
 * Rating — milliy Glicko-2 reyting bazasi: davrlar, idempotent hisob,
 * immutable tarix, ommaviy leaderboard. docs/14-roadmap.md Faza 3,
 * docs/06-rating-system.md.
 *
 * Eksport: RATING_PORT — tournament moduli ro'yxatga olishda ratingAtEntry
 * snapshot'ini shu port orqali oladi (docs/02-architecture.md §6.1).
 */
@Module({
  imports: [IdentityModule],
  controllers: [RatingController],
  providers: [
    RatingService,
    RatingRepository,
    { provide: RATING_PORT, useExisting: RatingService },
  ],
  exports: [RATING_PORT],
})
export class RatingModule {}
