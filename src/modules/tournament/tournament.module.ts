import { Module } from '@nestjs/common';

import { IdentityModule } from '../identity/identity.module';
import { OrgModule } from '../org/org.module';
import { PlayerModule } from '../player/player.module';
import { RatingModule } from '../rating/rating.module';
import { TournamentController } from './tournament.controller';
import { TournamentRepository } from './tournament.repository';
import { TournamentService } from './tournament.service';

/**
 * Tournament — turnir yadrosi: CRUD, seksiyalar, ro'yxatga olish,
 * holat mashinasi. [CANON 5] #4, docs/14-roadmap.md Faza 1.
 *
 * Kesishmalar faqat portlar orqali (docs/02-architecture.md §6.1):
 *  - PLAYER_PORT — o'yinchi profili (self-registration);
 *  - ORG_PORT    — klub → viloyat → federatsiya konteksti (RBAC scope);
 *  - RATING_PORT — ro'yxatga olishda ratingAtEntry snapshot'i (Faza 3).
 */
@Module({
  imports: [IdentityModule, PlayerModule, OrgModule, RatingModule],
  controllers: [TournamentController],
  providers: [TournamentService, TournamentRepository],
})
export class TournamentModule {}
