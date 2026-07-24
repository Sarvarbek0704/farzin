import { Module } from '@nestjs/common';

import { IdentityModule } from '../identity/identity.module';
import { ArbiterController } from './arbiter.controller';
import { ArbiterRepository } from './arbiter.repository';
import { ArbiterService } from './arbiter.service';

/**
 * Arbiter — hakam ish oqimi: tur generatsiyasi (round-robin), natija
 * kiritish, tur yakuni, jadval + tie-break. [CANON 5] #7,
 * docs/14-roadmap.md Faza 1, docs/02-architecture.md §5 (#7: arbiter →
 * tournament + pairing'ga tayanadi).
 *
 * Bog'liqliklar:
 *  - IdentityModule — RbacService (ruxsat tekshiruvi);
 *  - core/pairing, core/tiebreak — sof dvigatellar, to'g'ridan-to'g'ri;
 *  - AuditService/OutboxService/PrismaService — global modullar.
 *
 * Apellyatsiya (Appeal) — Faza 2 (to'liq oqim docs/14-roadmap.md).
 */
@Module({
  imports: [IdentityModule],
  controllers: [ArbiterController],
  providers: [ArbiterService, ArbiterRepository],
})
export class ArbiterModule {}
